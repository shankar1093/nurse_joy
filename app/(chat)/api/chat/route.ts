import {
  type Message,
  convertToCoreMessages,
  createDataStreamResponse,
  streamObject,
  streamText,
} from 'ai';
import { z } from 'zod';

import { auth } from '@/app/(auth)/auth';
import { customModel } from '@/lib/ai';
import { models } from '@/lib/ai/models';
import {
  codePrompt,
  updateDocumentPrompt,
} from '@/lib/ai/prompts';
import {
  deleteChatById,
  getChatById,
  getDocumentById,
  saveChat,
  saveDocument,
  saveMessages,
  saveSuggestions,
} from '@/lib/db/queries';
import type { Suggestion } from '@/lib/db/schema';
import {
  generateUUID,
  getMostRecentUserMessage,
  sanitizeResponseMessages,
} from '@/lib/utils';

import { generateTitleFromUserMessage } from '../../actions';

export const maxDuration = 60;

type AllowedTools =
  | 'createDocument'
  | 'updateDocument'
  | 'requestSuggestions'
  | 'getWeather';

const blocksTools: AllowedTools[] = [
  'createDocument',
  'updateDocument',
  'requestSuggestions',
];

const weatherTools: AllowedTools[] = ['getWeather'];

const allTools: AllowedTools[] = [...blocksTools, ...weatherTools];

const nursePrompt = `You are an experienced radiology nurse named Joy, focused solely on screening patients for contrast media administration. 

you should ensure the patient provides accurate responses and feels comfortable during the process.

Instructions for the chatbot:
	1.	Introduction:
	•	Greet the patient: “Hello! I’m here to help you complete a safety screening form for your upcoming imaging procedure with contrast dye. Your answers will help ensure your safety and guide our medical team.”
	•	Provide assurance: “This will only take a few minutes, and your responses will remain confidential.”
  • make sure to ask the patient their name, infer their gender and if uncertain gather it via conversation. 
  • Ask the Patient to upload a pdf of their patient history if they have it, This is optional
	2.	Ask the following questions from the PDF form:
	•	“Have you ever had a previous reaction or problem with intravenous contrast (‘x-ray dye’)? If yes, could you provide details?”
	•	“Have you ever had a life-threatening allergic reaction? If yes, could you share more details?”
	•	“Are you currently taking any of the following metformin-containing medications: Glucophage, Glucophage XR, Fortamet, Metaglip, Avandamet, Glucovance, Glumetza, or Riomet?”
	•	“Are you 60 years of age or older?”
	•	“Do you take medication for diabetes?”
	•	“Do you take medication for high blood pressure?”
	•	“Do you suffer from kidney disease?”
	•	“Do you have one kidney or have you had a kidney transplant?”
	•	“Could you share your height and weight?”
	•	“When was the last time you ate or drank anything other than water?”
	3.	For women of childbearing age only:
	•	“Is there any possibility that you might be pregnant?”
	•	“Are you currently breastfeeding?”
	4.	Validation and Summary:
	•	Summarize the answers provided by the patient: “Thank you for your responses. Let me quickly summarize what you’ve shared to ensure accuracy.”
	•	Allow the patient to review or correct their responses.
	5.	Closing:
	•	Thank the patient: “Thank you for your time and cooperation. If you have any additional questions or concerns, please don’t hesitate to ask. Our team will review your responses and provide any necessary follow-up.”
	•	Inform the patient about the next steps: “You’re all set for now. We’ll contact you if anything further is needed before your procedure.”

If asked about anything unrelated to contrast screening, politely redirect the conversation back to the screening process. Once complete, Create a document that says "Patient Info" and list the questions above and answers. List the patient history if they have provided anything`;

const nursePrompt_rv = `
You are an experienced radiology nurse named Joy, specializing in screening patients for contrast media administration. Your primary role is to ensure the patient provides accurate responses and feels comfortable during the screening process.

---

### Instructions for Chatbot:

#### 1. Introduction:
- Greet the patient: 
  “Hello! I’m here to assist you with a CT Contrast Consent Form for Radiology Victoria (make this bold) form for your upcoming imaging procedure with contrast dye. Your answers will help ensure your safety and guide our medical team.”
- Provide assurance: 
  “This will only take a few minutes, and your responses will remain confidential.”
- Initial questions:
  - Ask for the patient’s name and infer their gender during the conversation. If uncertain, ask politely: “May I know your gender for the form?”
  - Ask the patient to upload a PDF of their medical history if they have it. This step is optional:
    “If you have a copy of your medical history, you can upload it here. It will help us complete the screening faster.”

---

#### 2. Screening Questions (as per the PDF form):
- “Have you had a CT scan before? If yes, what body part, where, and when?”
- “Have you had an injection of iodinated contrast before? If yes, did you experience any reaction to it?”
- “Do you have any allergies (e.g., foods, medicines, latex, others)? If yes, please list them.”
- “Do you carry an EpiPen?”
- “Do you have asthma?”
- “Do you have diabetes?”
- “Do you take Metformin?”
- “Do you have a history of kidney failure?”
- “Do you have a history of kidney disease?”
- “Are you currently taking any medications? If yes, please list them.”
- “Do you take beta blockers (e.g., metoprolol, sotalol)?”
- “Have you ever smoked?”
- “Have you had any operations? If yes, please provide details.”
- “Do you have any history of cancer?”

---

#### 3. Additional Medical History Questions:
- “Have you ever been diagnosed with the following conditions? Please answer yes or no for each:”
  - Liver disease
  - Multiple myeloma
  - Hyperthyroidism (overactive thyroid)
  - Hypertension (high blood pressure)
  - Stroke
  - Heart attack
  - Sickle cell anemia
  - Myasthenia gravis

---

#### 4. Special Questions for Female Patients:
If the patient identifies as female:
- “Is there any possibility that you might be pregnant?”
- “Are you currently breastfeeding?”

---

#### 5. Validation and Summary:
- Summarize the patient’s responses:
  “Thank you for your responses. Let me quickly summarize what you’ve shared to ensure accuracy.”
- Display the summary of answers and allow the patient to confirm or correct their responses.

---

#### 6. Closing:
- Thank the patient:
  “Thank you for your time and cooperation. If you have any additional questions or concerns, please don’t hesitate to ask.”
- Inform about next steps:
  “You’re all set for now. Our team will review your responses and provide any necessary follow-up. We’ll contact you if anything further is needed before your procedure.”

---

#### 7. Documentation Creation:
At the end of the session, create a document titled “Patient Info.” The document should include:
- All questions asked during the session and the corresponding answers provided by the patient.
- Any patient history uploaded as a PDF.

---

### Guidance for Handling Off-Topic Questions:
If the patient asks about anything unrelated to contrast screening, politely redirect them back to the screening process:
“That’s a great question, but my focus here is to ensure your safety for the imaging procedure with contrast dye. Let’s complete this screening first, and I can guide you to the right resource for other concerns.”
`;

export async function POST(request: Request) {
  const {
    id,
    messages,
    modelId,
  }: { id: string; messages: Array<Message>; modelId: string } =
    await request.json();

  const session = await auth();

  if (!session || !session.user || !session.user.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const model = models.find((model) => model.id === modelId);

  if (!model) {
    return new Response('Model not found', { status: 404 });
  }

  const coreMessages = convertToCoreMessages(messages);
  const userMessage = getMostRecentUserMessage(coreMessages);

  if (!userMessage) {
    return new Response('No user message found', { status: 400 });
  }

  const chat = await getChatById({ id });

  if (!chat) {
    const title = await generateTitleFromUserMessage({ message: userMessage });
    await saveChat({ id, userId: session.user.id, title });
  }

  const userMessageId = generateUUID();

  await saveMessages({
    messages: [
      { ...userMessage, id: userMessageId, createdAt: new Date(), chatId: id },
    ],
  });

  return createDataStreamResponse({
    execute: (dataStream) => {
      dataStream.writeData({
        type: 'user-message-id',
        content: userMessageId,
      });

      const result = streamText({
        model: customModel(model.apiIdentifier),
        system: nursePrompt_rv,
        messages: coreMessages,
        maxSteps: 5,
        experimental_activeTools: allTools,
        tools: {
          getWeather: {
            description: 'Get the current weather at a location',
            parameters: z.object({
              latitude: z.number(),
              longitude: z.number(),
            }),
            execute: async ({ latitude, longitude }) => {
              const response = await fetch(
                `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m&hourly=temperature_2m&daily=sunrise,sunset&timezone=auto`,
              );

              const weatherData = await response.json();
              return weatherData;
            },
          },
          createDocument: {
            description:
              'Create a document for a writing activity. This tool will call other functions that will generate the contents of the document based on the title and kind.',
            parameters: z.object({
              title: z.string(),
              kind: z.enum(['text', 'code']),
            }),
            execute: async ({ title, kind }) => {
              const id = generateUUID();
              let draftText = '';

              dataStream.writeData({
                type: 'id',
                content: id,
              });

              dataStream.writeData({
                type: 'title',
                content: title,
              });

              dataStream.writeData({
                type: 'kind',
                content: kind,
              });

              dataStream.writeData({
                type: 'clear',
                content: '',
              });

              if (kind === 'text') {
                const { fullStream } = streamText({
                  model: customModel(model.apiIdentifier),
                  system:
                    'Write about the given topic. Markdown is supported. Use headings wherever appropriate.',
                  prompt: title,
                });

                for await (const delta of fullStream) {
                  const { type } = delta;

                  if (type === 'text-delta') {
                    const { textDelta } = delta;

                    draftText += textDelta;
                    dataStream.writeData({
                      type: 'text-delta',
                      content: textDelta,
                    });
                  }
                }

                dataStream.writeData({ type: 'finish', content: '' });
              } else if (kind === 'code') {
                const { fullStream } = streamObject({
                  model: customModel(model.apiIdentifier),
                  system: codePrompt,
                  prompt: title,
                  schema: z.object({
                    code: z.string(),
                  }),
                });

                for await (const delta of fullStream) {
                  const { type } = delta;

                  if (type === 'object') {
                    const { object } = delta;
                    const { code } = object;

                    if (code) {
                      dataStream.writeData({
                        type: 'code-delta',
                        content: code ?? '',
                      });

                      draftText = code;
                    }
                  }
                }

                dataStream.writeData({ type: 'finish', content: '' });
              }

              if (session.user?.id) {
                await saveDocument({
                  id,
                  title,
                  kind,
                  content: draftText,
                  userId: session.user.id,
                });
              }

              return {
                id,
                title,
                kind,
                content:
                  'A document was created and is now visible to the user.',
              };
            },
          },
          updateDocument: {
            description: 'Update a document with the given description.',
            parameters: z.object({
              id: z.string().describe('The ID of the document to update'),
              description: z
                .string()
                .describe('The description of changes that need to be made'),
            }),
            execute: async ({ id, description }) => {
              const document = await getDocumentById({ id });

              if (!document) {
                return {
                  error: 'Document not found',
                };
              }

              const { content: currentContent } = document;
              let draftText = '';

              dataStream.writeData({
                type: 'clear',
                content: document.title,
              });

              if (document.kind === 'text') {
                const { fullStream } = streamText({
                  model: customModel(model.apiIdentifier),
                  system: updateDocumentPrompt(currentContent, 'text'),
                  prompt: description,
                  experimental_providerMetadata: {
                    openai: {
                      prediction: {
                        type: 'content',
                        content: currentContent,
                      },
                    },
                  },
                });

                for await (const delta of fullStream) {
                  const { type } = delta;

                  if (type === 'text-delta') {
                    const { textDelta } = delta;

                    draftText += textDelta;
                    dataStream.writeData({
                      type: 'text-delta',
                      content: textDelta,
                    });
                  }
                }

                dataStream.writeData({ type: 'finish', content: '' });
              } else if (document.kind === 'code') {
                const { fullStream } = streamObject({
                  model: customModel(model.apiIdentifier),
                  system: updateDocumentPrompt(currentContent, 'code'),
                  prompt: description,
                  schema: z.object({
                    code: z.string(),
                  }),
                });

                for await (const delta of fullStream) {
                  const { type } = delta;

                  if (type === 'object') {
                    const { object } = delta;
                    const { code } = object;

                    if (code) {
                      dataStream.writeData({
                        type: 'code-delta',
                        content: code ?? '',
                      });

                      draftText = code;
                    }
                  }
                }

                dataStream.writeData({ type: 'finish', content: '' });
              }

              if (session.user?.id) {
                await saveDocument({
                  id,
                  title: document.title,
                  content: draftText,
                  kind: document.kind,
                  userId: session.user.id,
                });
              }

              return {
                id,
                title: document.title,
                kind: document.kind,
                content: 'The document has been updated successfully.',
              };
            },
          },
          requestSuggestions: {
            description: 'Request suggestions for a document',
            parameters: z.object({
              documentId: z
                .string()
                .describe('The ID of the document to request edits'),
            }),
            execute: async ({ documentId }) => {
              const document = await getDocumentById({ id: documentId });

              if (!document || !document.content) {
                return {
                  error: 'Document not found',
                };
              }

              const suggestions: Array<
                Omit<Suggestion, 'userId' | 'createdAt' | 'documentCreatedAt'>
              > = [];

              const { elementStream } = streamObject({
                model: customModel(model.apiIdentifier),
                system:
                  'You are a help writing assistant. Given a piece of writing, please offer suggestions to improve the piece of writing and describe the change. It is very important for the edits to contain full sentences instead of just words. Max 5 suggestions.',
                prompt: document.content,
                output: 'array',
                schema: z.object({
                  originalSentence: z
                    .string()
                    .describe('The original sentence'),
                  suggestedSentence: z
                    .string()
                    .describe('The suggested sentence'),
                  description: z
                    .string()
                    .describe('The description of the suggestion'),
                }),
              });

              for await (const element of elementStream) {
                const suggestion = {
                  originalText: element.originalSentence,
                  suggestedText: element.suggestedSentence,
                  description: element.description,
                  id: generateUUID(),
                  documentId: documentId,
                  isResolved: false,
                };

                dataStream.writeData({
                  type: 'suggestion',
                  content: suggestion,
                });

                suggestions.push(suggestion);
              }

              if (session.user?.id) {
                const userId = session.user.id;

                await saveSuggestions({
                  suggestions: suggestions.map((suggestion) => ({
                    ...suggestion,
                    userId,
                    createdAt: new Date(),
                    documentCreatedAt: document.createdAt,
                  })),
                });
              }

              return {
                id: documentId,
                title: document.title,
                kind: document.kind,
                message: 'Suggestions have been added to the document',
              };
            },
          },
        },
        onFinish: async ({ response }) => {
          if (session.user?.id) {
            try {
              const responseMessagesWithoutIncompleteToolCalls =
                sanitizeResponseMessages(response.messages);

              await saveMessages({
                messages: responseMessagesWithoutIncompleteToolCalls.map(
                  (message) => {
                    const messageId = generateUUID();

                    if (message.role === 'assistant') {
                      dataStream.writeMessageAnnotation({
                        messageIdFromServer: messageId,
                      });
                    }

                    return {
                      id: messageId,
                      chatId: id,
                      role: message.role,
                      content: message.content,
                      createdAt: new Date(),
                    };
                  },
                ),
              });
            } catch (error) {
              console.error('Failed to save chat');
            }
          }
        },
        experimental_telemetry: {
          isEnabled: true,
          functionId: 'stream-text',
        },
      });

      result.mergeIntoDataStream(dataStream);
    },
  });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new Response('Not Found', { status: 404 });
  }

  const session = await auth();

  if (!session || !session.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const chat = await getChatById({ id });

    if (chat.userId !== session.user.id) {
      return new Response('Unauthorized', { status: 401 });
    }

    await deleteChatById({ id });

    return new Response('Chat deleted', { status: 200 });
  } catch (error) {
    return new Response('An error occurred while processing your request', {
      status: 500,
    });
  }
}
