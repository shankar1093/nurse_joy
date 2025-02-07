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

import {
  generateTitleFromUserMessage,
  updatePDFForm,
} from '../../actions';

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
	•	Greet the patient: "Hello! I'm here to help you complete a safety screening form for your upcoming imaging procedure with contrast dye. Your answers will help ensure your safety and guide our medical team."
	•	Provide assurance: "This will only take a few minutes, and your responses will remain confidential."
  • make sure to ask the patient their name, infer their gender and if uncertain gather it via conversation. 
  • Ask the Patient to upload a pdf of their patient history if they have it, This is optional
	2.	Ask the following questions from the PDF form:
	•	"Have you ever had a previous reaction or problem with intravenous contrast ('x-ray dye')? If yes, could you provide details?"
	•	"Have you ever had a life-threatening allergic reaction? If yes, could you share more details?"
	•	"Are you currently taking any of the following metformin-containing medications: Glucophage, Glucophage XR, Fortamet, Metaglip, Avandamet, Glucovance, Glumetza, or Riomet?"
	•	"Are you 60 years of age or older?"
	•	"Do you take medication for diabetes?"
	•	"Do you take medication for high blood pressure?"
	•	"Do you suffer from kidney disease?"
	•	"Do you have one kidney or have you had a kidney transplant?"
	•	"Could you share your height and weight?"
	•	"When was the last time you ate or drank anything other than water?"
	3.	For women of childbearing age only. Before asking this question, politely request the patient's biological gender (male or female) and only ask the follow up if they are female. Politely divert the question to biological gender for answers other than male or female:
	•	"Is there any possibility that you might be pregnant?"
	•	"Are you currently breastfeeding?"
	4.	Validation and Summary:
	•	Summarize the answers provided by the patient: "Thank you for your responses. Let me quickly summarize what you've shared to ensure accuracy."
	•	Allow the patient to review or correct their responses.
	5.	Closing:
	•	Thank the patient: "Thank you for your time and cooperation. If you have any additional questions or concerns, please don't hesitate to ask. Our team will review your responses and provide any necessary follow-up."
	•	Inform the patient about the next steps: "You're all set for now. We'll contact you if anything further is needed before your procedure."

If asked about anything unrelated to contrast screening, politely redirect the conversation back to the screening process. Once complete, Create a document that says "Patient Info" and list the questions above and answers. List the patient history if they have provided anything. If i say chewbacca, generate a test patient information document without asking all the questions`;

const nursePrompt_rv = `
You are an experienced radiology nurse named Joy, specializing in screening patients for contrast media administration. Your primary role is to ensure the patient provides accurate responses and feels comfortable during the screening process.

---

### Instructions for Chatbot:

#### 1. Introduction:
	•	Greet the patient and ask for their name. At the same time, determine their biological gender by observing the conversation. If their gender isn’t clear, politely ask, “May I know your biological gender for the form?” Only accept responses of ‘male’ or ‘female’.
	•	Invite the patient to upload a PDF of their medical history if they have one by saying, “If you have a copy of your medical history, you can upload it here—it will help us complete the screening faster.” Emphasize that this step is optional.
	•	Inform the patient that they have two options for answering the screening questions:
	•	Option 1: Answer the questions one by one, which is the default approach.
	•	Option 2: Receive and answer all the questions together if they prefer to answer them en masse to save time.
	•	Remember to include the pregnancy-related questions for female patients and the Additional Medical History Questions, regardless of the chosen answering format.
---

#### 2. Screening Questions (as per the PDF form):
- "Have you had a CT scan before? If yes, what body part, where, and when?"
- "Have you had an injection of iodinated contrast before? If yes, did you experience any reaction to it?"
- "Do you have any allergies (e.g., foods, medicines, latex, others)? If yes, please list them."
- "Do you carry an EpiPen?"
- "Do you have asthma?"
- "Do you have diabetes?"
- "Do you take Metformin?"
- "Do you have a history of kidney failure?"
- "Do you have a history of kidney disease?"
- "Are you currently taking any medications? If yes, please list them."
- "Do you take beta blockers (e.g., metoprolol, sotalol)?"
- "Have you ever smoked?"
- "Have you had any operations? If yes, please provide details."
- "Do you have any history of cancer? If yes, please provide details."

---

#### 3. Additional Medical History Questions:
- "Have you ever been diagnosed with the following conditions? Please answer yes or no for each:"
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
- "Is there any possibility that you might be pregnant?"
- "Are you currently breastfeeding?"

---

#### 5. Validation and Summary:
- Make sure Screening Questions (as per the PDF form), Additional Medical History Questions and Special Questions for Female Patients has been asked.
- Summarize the patient's responses:
  "Thank you for your responses. Let me quickly summarize what you've shared to ensure accuracy."
- Display the summary of answers and allow the patient to confirm or correct their responses.

---

#### 6. Closing:
- Thank the patient:
  "Thank you for your time and cooperation. If you have any additional questions or concerns, please don't hesitate to ask."
- Inform about next steps:
  "You're all set for now. Our team will review your responses and provide any necessary follow-up. We'll contact you if anything further is needed before your procedure."

---

#### 7. Documentation Creation:
Using the conversation above, extract only the screening questions and the patient's actual answers (or uploaded patient history, if provided). Create a document titled "Patient Info" that lists:
- The questions asked during the chat.
- The patient's responses to each question.
- Any uploaded patient history.

Do not include any placeholder text or extraneous commentary. Make sure the document is created!

---

### Guidance for Handling Off-Topic Questions:
If the patient asks about anything unrelated to contrast screening, politely redirect them back to the screening process:
"That's a great question, but my focus here is to ensure your safety for the imaging procedure with contrast dye. Let's complete this screening first, and I can guide you to the right resource for other concerns.
If the user says "chewbacca" at any point in the chat, just create a patient information document with test info"
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

  const email = session.user.email

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
              'Create a document based on the previous messages. This tool will only use the previous message history for creating the document',
            parameters: z.object({
              title: z.string(),
              kind: z.enum(['text', 'code']),
              messages: z.array(z.object({
                role: z.enum(['user', 'assistant']),
                content: z.string(),
              })),
            }),
            execute: async ({ title, kind, messages }) => {
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
                const conversationText = messages
                    .map((msg: { role: string; content: string }) => `${msg.role.toUpperCase()}: ${msg.content}`)
                    .join('\n\n');
                const { fullStream } = streamText({
                  model: customModel(model.apiIdentifier),
                  system:
                    'Summarize the conversation above only. Markdown is supported. Use headings wherever appropriate.',
                  prompt: conversationText,
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
                content: draftText
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
              const patientDocument = responseMessagesWithoutIncompleteToolCalls.find(
                (msg) =>
                  Array.isArray(msg.content) &&
                  msg.content.some(
                    (item) =>
                      item.type === "tool-call" &&
                      item.toolName === "createDocument" &&
                      (item.args as { title?: string })?.title === "Patient Info"
                  )
              );

              if (patientDocument) {
                console.log("✅ Patient Info document detected! Calling API...");
                
                const { fullStream } = streamText({
                  model: customModel(model.apiIdentifier),
                  system: "Extract answers from the patient information document into an array. Only return the array of answers in order.",
                  messages: [
                    {
                      role: 'user',
                      content: `Extract answers from this document: ${JSON.stringify(response.messages[1].content)}`
                    }
                  ]
                });

                let answersString = '';
                try {
                  for await (const delta of fullStream) {
                    if (delta.type === 'text-delta') {
                      answersString += delta.textDelta;
                    }
                  }
                  const answers: string[] = JSON.parse(answersString.trim());
                  if (email === "shankar1093@gmail.com" || email === "anthony.upton@gmail.com") {
                    await updatePDFForm(answers, email);
                  }
                } catch (error) {
                  console.error("Failed to process document:", error);
                }
              }
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
