'use client'
import {patientConversationbyId} from '../../actions'
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export default function Page() {
    const [displayedMessages, setDisplayedMessages] = useState<any[]>([]); // State for displayed messages
    const [conversation, setConversation] = useState<any>(null);
    const [loading, setLoading] = useState(true);           // State for loading indicator
    const [error, setError] = useState(null); 
    const searchParams = useSearchParams();
    const id = searchParams.get('id')
    if (id === null) {
        throw new Error("ID parameter is missing in the URL."); // Raise an error if id is null
    }

    useEffect(() => {
        const fetchConversation = async () => {
            try {
                if (id) {
                    const cleanedId = id.replace(/^'+|'+$/g, '')
                    const response = await patientConversationbyId({ userId: cleanedId });
                    setConversation(response); // Set the conversation state with the response
                                    // Load messages one by one
                for (let i = 0; i < response.length; i++) {
                    setTimeout(() => {
                        setDisplayedMessages(prev => [...prev, response[i]]);
                    }, i * 100); // Delay of 1 second between messages
                }
                } else {
                    console.error('No user ID provided');
                }


            } catch (error) {
                console.error('Error fetching conversation:', error);
                // Handle error state if needed
            }
        };

        fetchConversation(); // Call the fetch function
    }, []);
    return (
        <div className="bg-black text-white p-5">
            {displayedMessages.length > 0 ? (
                <div>
                    <h2>Conversation Details</h2>
                    {displayedMessages.map((conv, index) => (
                        <div key={index}>
                            <p><strong>Message:</strong> {Array.isArray(conv.messageContent) ? conv.messageContent[0].text : conv.messageContent}</p>
                            <p><strong>User ID:</strong> {conv.userId}</p>
                            <p><strong>Date: </strong> {conv.chatCreatedAt.toLocaleDateString()}</p>
                            <p><strong>Time: </strong> {conv.chatCreatedAt.toLocaleTimeString() }</p>
                        </div>
                    ))}
                </div>
            ) : (
                <p>Loading conversation...</p>
            )}
        </div>
    )
}