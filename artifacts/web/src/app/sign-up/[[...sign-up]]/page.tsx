import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 bg-zinc-950">
      <SignUp
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
        fallbackRedirectUrl="/dashboard"
        appearance={{
          variables: {
            colorPrimary: "#10b981",
            colorBackground: "#09090b",
            colorForeground: "#fafafa",
            colorInput: "#18181b",
            colorInputForeground: "#fafafa",
            colorNeutral: "#3f3f46",
          },
          elements: {
            rootBox: "w-full flex justify-center",
            cardBox: "rounded-2xl w-[440px] max-w-full overflow-hidden bg-zinc-900",
            card: "!shadow-none !border-0 !bg-transparent !rounded-none",
            footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
            headerTitle: "text-zinc-50",
            headerSubtitle: "text-zinc-400",
            socialButtonsBlockButtonText: "text-zinc-200",
            formFieldLabel: "text-zinc-300",
            footerActionLink: "text-emerald-400 hover:text-emerald-300",
            footerActionText: "text-zinc-400",
            dividerText: "text-zinc-500",
            formButtonPrimary: "bg-emerald-600 hover:bg-emerald-500",
            formFieldInput: "bg-zinc-800 border-zinc-700 text-zinc-50",
          },
        }}
      />
    </div>
  );
}
