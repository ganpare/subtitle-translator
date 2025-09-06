import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { getDatabase } from './database';

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      console.log("🔍 SignIn callback called:", {
        hasUser: !!user,
        hasAccount: !!account,
        hasProfile: !!profile,
        provider: account?.provider,
        email: user?.email
      });
      
      // ユーザーがサインインした時の処理
      if (account?.provider === 'google') {
        try {
          const db = getDatabase();
          
          // 既存ユーザーをチェック
          const existingUser = db.prepare(
            'SELECT id FROM users WHERE email = ?'
          ).get(user.email) as { id: string } | undefined;
          
          if (!existingUser) {
            // 新規ユーザーを作成
            const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const now = Date.now();
            
            console.log("💾 Creating new user:", {
              userId,
              email: user.email,
              name: user.name,
              providerAccountId: account.providerAccountId
            });
            
            db.prepare(`
              INSERT INTO users (
                id, email, name, image, provider, provider_id, 
                created_at, last_active
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              userId,
              user.email,
              user.name,
              user.image,
              'google',
              account.providerAccountId,
              now,
              now
            );
            
            console.log("✅ User created successfully");
          } else {
            console.log("✅ User already exists:", existingUser.id);
          }
          
          return true;
        } catch (error) {
          console.error('❌ Sign in error:', error);
          return false;
        }
      }
      return true;
    },
    async session({ session, token }) {
      // セッション情報をカスタマイズ
      if (session.user?.email) {
        try {
          const db = getDatabase();
          const user = db.prepare(
            'SELECT id, email, name, image, provider FROM users WHERE email = ?'
          ).get(session.user.email) as {
            id: string;
            email: string;
            name: string;
            image: string;
            provider: string;
          } | undefined;
          
          if (user) {
            // 最終アクティブ時間を更新
            db.prepare('UPDATE users SET last_active = ? WHERE id = ?')
              .run(Date.now(), user.id);
            
            console.log("🔍 Session callback - user found:", {
              id: user.id,
              email: user.email,
              name: user.name
            });
            
            return {
              ...session,
              user: {
                ...session.user,
                id: user.id,
                provider: user.provider,
              },
            };
          } else {
            console.log("❌ Session callback - user not found in database:", session.user.email);
          }
        } catch (error) {
          console.error("❌ Session callback error:", error);
        }
      }
      return session;
    },
    async jwt({ token, user, account }) {
      // JWTトークンにユーザー情報を追加
      if (user) {
        token.id = user.id;
        token.provider = account?.provider;
      }
      return token;
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  session: {
    strategy: 'jwt',
  },
  secret: process.env.NEXTAUTH_SECRET,
};