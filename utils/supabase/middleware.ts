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
    user = null;
  }

  const { pathname } = request.nextUrl;

  // 1. Protect /owner routes
  if (pathname.startsWith("/owner")) {
    const isLoginPage = pathname === "/owner/login";

    if (!user) {
      if (!isLoginPage) {
        const loginUrl = new URL("/owner/login", request.url);
        const redirectResponse = NextResponse.redirect(loginUrl);
        supabaseResponse.cookies.getAll().forEach((cookie) => {
          redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
        });
        return redirectResponse;
      }
    } else {
      let role: string | null = null;
      let isActive = true;
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role, is_active")
          .eq("id", user.id)
          .maybeSingle();
        role = profile?.role ?? null;
        isActive = profile?.is_active !== false;
      } catch (err) {
        role = null;
        isActive = false;
      }

      if (isLoginPage) {
        // Authenticated owner visiting login page is redirected to portal
        if (role === "owner" && isActive) {
          const ownerUrl = new URL("/owner", request.url);
          const redirectResponse = NextResponse.redirect(ownerUrl);
          supabaseResponse.cookies.getAll().forEach((cookie) => {
            redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
          });
          return redirectResponse;
        }
      } else {
        // Protected /owner page requires active 'owner' role
        if (role !== "owner" || !isActive) {
          const redirectUrl = new URL("/owner/login", request.url);
          redirectUrl.searchParams.set("error", !isActive ? "deactivated" : "unauthorized");
          const redirectResponse = NextResponse.redirect(redirectUrl);
          supabaseResponse.cookies.getAll().forEach((cookie) => {
            redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
          });
          return redirectResponse;
        }
      }
    }
  }

  // 2. Protect /staff routes
  if (pathname.startsWith("/staff")) {
    if (!user) {
      // Unauthenticated user attempting to access staff POS
      const loginUrl = new URL("/owner/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      const redirectResponse = NextResponse.redirect(loginUrl);
      supabaseResponse.cookies.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
      });
      return redirectResponse;
    } else {
      // Authenticated user: verify active staff or owner role
      let role: string | null = null;
      let isActive = true;
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role, is_active")
          .eq("id", user.id)
          .maybeSingle();
        role = profile?.role ?? null;
        isActive = profile?.is_active !== false;
      } catch (err) {
        role = null;
        isActive = false;
      }

      if ((role !== "staff" && role !== "owner") || !isActive) {
        const redirectUrl = new URL("/owner/login", request.url);
        redirectUrl.searchParams.set("error", !isActive ? "deactivated" : "unauthorized");
        const redirectResponse = NextResponse.redirect(redirectUrl);
        supabaseResponse.cookies.getAll().forEach((cookie) => {
          redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
        });
        return redirectResponse;
      }
    }
  }

  return supabaseResponse;
};

export const createClient = updateSession;
