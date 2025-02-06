import { NextResponse } from 'next/server';

export async function GET(request: Request, { params }: {params: {id: string}}) {
  const userId = params.id
  
  if (!userId) {
    return NextResponse.json({error: 'User ID is required'}, { status: 400});
  }

  return NextResponse.json({ success:true });
}