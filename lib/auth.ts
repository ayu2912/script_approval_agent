import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const validUsername = process.env.ADMIN_USERNAME;
        const validPassword = process.env.ADMIN_PASSWORD;

        if (!validUsername || !validPassword) {
          throw new Error("Admin credentials not configured");
        }

        if (
          credentials?.username === validUsername &&
          credentials?.password === validPassword
        ) {
          return { id: "1", name: validUsername, email: `${validUsername}@greenlit.local` };
        }

        return null;
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async session({ session, token }) {
      if (session.user && token.name) {
        session.user.name = token.name;
      }
      return session;
    },
    async jwt({ token, user }) {
      if (user?.name) {
        token.name = user.name;
      }
      return token;
    },
  },
};
