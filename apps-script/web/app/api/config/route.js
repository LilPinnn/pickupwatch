import { NextResponse } from 'next/server';
import { getConfig, saveConfig } from '../../../lib/store';

export async function GET(req) {
  const token = req.headers.get('x-session-token');
  try {
    return NextResponse.json(getConfig(token));
  } catch (err) {
    return NextResponse.json({ message: err.message }, { status: err.status || 400 });
  }
}

export async function POST(req) {
  const token = req.headers.get('x-session-token');
  const config = await req.json();
  try {
    return NextResponse.json(saveConfig(token, config));
  } catch (err) {
    return NextResponse.json({ message: err.message }, { status: err.status || 400 });
  }
}
