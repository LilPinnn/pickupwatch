import { NextResponse } from 'next/server';
import { logout } from '../../../lib/store';

export async function POST(req) {
  const { token } = await req.json();
  const result = logout(token);
  return NextResponse.json(result);
}
