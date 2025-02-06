'use client';

import { updateChatVisibility } from '@/app/(chat)/actions';
import type { VisibilityType } from '@/components/visibility-selector';
import type { Chat } from '@/lib/db/schema';
import { useMemo } from 'react';
import useSWR, { useSWRConfig } from 'swr';

export function useChatVisibility({
  chatId,
  initialVisibility,
}: {
  chatId: string;
  initialVisibility: VisibilityType;
}) {
  const { mutate, cache } = useSWRConfig();
  const history: Array<Chat> = cache.get('/api/history')?.data;

  const { data: localVisibility, mutate: setLocalVisibility } = useSWR(
    `${chatId}-visibility`,
    null,
    {
      fallbackData: 'private',
    },
  );

  const visibilityType = useMemo(() => {
    return 'private';
  }, []);

  const setVisibilityType = (updatedVisibilityType: VisibilityType) => {
    const forcedPrivate: VisibilityType = 'private';
    setLocalVisibility(forcedPrivate);

    mutate<Array<Chat>>(
      '/api/history',
      (history) => {
        return history
          ? history.map((chat) => ({
              ...chat,
              visibility: 'private',
            }))
          : [];
      },
      { revalidate: false },
    );

    updateChatVisibility({
      chatId: chatId,
      visibility: 'private',
    });
  };

  return { visibilityType, setVisibilityType };
}
