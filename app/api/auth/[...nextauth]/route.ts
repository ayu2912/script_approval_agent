// CRITICAL: NEXTAUTH_URL must be set to https://greenlit.ruskaruma.me in Vercel
// Environment Variables dashboard. If set to localhost, OAuth and magic links break.
// Also set in Twilio Console: Messaging > Try it out > Sandbox settings >
// "When a message comes in" = https://greenlit.ruskaruma.me/api/webhooks/whatsapp

import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
