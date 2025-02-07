'use server';

import { type CoreUserMessage, generateText } from 'ai';
import { cookies } from 'next/headers';
import { degrees, PDFDocument, rgb, StandardFonts,grayscale } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { promises as fs } from 'fs';
import path, { join } from 'path';

import { customModel } from '@/lib/ai';
import {
  deleteMessagesByChatIdAfterTimestamp,
  getMessageById,
  updateChatVisiblityById,
  getConversationByUserId
} from '@/lib/db/queries';
import type { VisibilityType } from '@/components/visibility-selector';
import { get } from 'http';
import getConfig from 'next/config';
import { NextResponse } from 'next/server';

export async function saveModelId(model: string) {
  const cookieStore = await cookies();
  cookieStore.set('model-id', model);
}

export async function generateTitleFromUserMessage({
  message,
}: {
  message: CoreUserMessage;
}) {
  const { text: title } = await generateText({
    model: customModel('gpt-4o-mini'),
    system: `\n
    - you will generate a short title using the patient's name
    - ensure it is not more than 80 characters long
    - the title should be a user's name-questionnaire
    - do not use quotes or colons`,
    prompt: JSON.stringify(message),
  });

  return title;
}

export async function deleteTrailingMessages({ id }: { id: string }) {
  const [message] = await getMessageById({ id });

  await deleteMessagesByChatIdAfterTimestamp({
    chatId: message.chatId,
    timestamp: message.createdAt,
  });
}

export async function updatePDFForm(formAnswers: string[], userEmail: string) {
  try {
    const response = await fetch(process.env.NODE_ENV === 'development' 
        ? "http://localhost:8000/update_pdf/" 
        : "https://nurse-joy-backend.onrender.com/update_pdf/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          answers: formAnswers,
          recipient: userEmail
        }),
      });
    } catch  (error) {
        return NextResponse.json(
          { error: 'Failed to process request' },
          { status: 500 },
        );
    }
}

export async function updateChatVisibility({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: VisibilityType;
}) {
  await updateChatVisiblityById({ chatId, visibility });
}
