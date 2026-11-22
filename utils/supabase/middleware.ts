import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://guvdawwjgxwvdqqedvfy.supabase.co";
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

export const updateSession = async (request: NextRequest) => {
  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // IMPORTANT: Call getUser() to refresh auth session tokens and validate user
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (err) {
    // If auth token is malformed or network issue, user remains null
    user = null;
  }

  const { pathname } = request.nextUrl;

  // Protect /owner routes
  if (pathname.startsWith("/owner")) {
    const isLoginPage = pathname === "/owner/login";

    if (!user) {
      // Unauthenticated user attempting to access protected owner page
      if (!isLoginPage) {
        const loginUrl = new URL("/owner/login", request.url);
        const redirectResponse = NextResponse.redirect(loginUrl);
        supabaseResponse.cookies.getAll().forEach((cookie) => {
          redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
        });
        return redirectResponse;
      }
    } else {
      // Authenticated user: verify owner role via profiles table
      let role: string | null = null;
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();
        role = profile?.role ?? null;
      } catch (err) {
        role = null;
      }

      if (isLoginPage) {
        // If an authenticated owner visits the login page, redirect to the owner portal
        if (role === "owner") {
          const ownerUrl = new URL("/owner", request.url);
          const redirectResponse = NextResponse.redirect(ownerUrl);
          supabaseResponse.cookies.getAll().forEach((cookie) => {
            redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
          });
          return redirectResponse;
        }
      } else {
        // Protected /owner page: reject if not owner role
        if (role !== "owner") {
          const redirectUrl = new URL("/owner/login", request.url);
          redirectUrl.searchParams.set("error", "unauthorized");
          const redirectResponse = NextResponse.redirect(redirectUrl);
          supabaseResponse.cookies.getAll().forEach((cookie) => {
            redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
          });
          return redirectResponse;
        }
      }
    }
  }

  return supabaseResponse;
};

export const createClient = updateSession;
