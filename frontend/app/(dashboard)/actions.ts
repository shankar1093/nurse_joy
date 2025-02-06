'use server';
import {
    getConversationByUserId
} from '@/lib/db/queries';


export async function patientConversationbyId(
    { userId }: { userId: string }
): Promise<any> {
    return getConversationByUserId({ id: userId });
}
