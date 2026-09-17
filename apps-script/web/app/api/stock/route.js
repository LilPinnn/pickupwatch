import { NextResponse } from 'next/server';
import { fetchAllStock } from '../../../lib/store';

export async function POST(req) {
  const token = req.headers.get('x-session-token');
  const { location, products } = await req.json();
  try {
    const result = await fetchAllStock(token, location, products);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ message: err.message }, { status: err.status || 400 });
  }
}
