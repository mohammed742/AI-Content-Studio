import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <SignUp
        fallbackRedirectUrl="/dashboard"
        appearance={{
          variables: {
            colorPrimary: "#10b981",
            colorBackground: "#09090b",
            colorText: "#fafafa",
            colorInputBackground: "#18181b",
            colorInputText: "#fafafa",
          },
        }}
      />
    </div>
  );
}
