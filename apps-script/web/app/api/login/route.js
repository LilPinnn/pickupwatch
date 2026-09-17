import { NextResponse } from 'next/server';
import { login } from '../../../lib/store';

export async function POST(req) {
  const { username, password } = await req.json();
  try {
    const result = login(username, password);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ message: err.message }, { status: err.status || 400 });
  }
}
