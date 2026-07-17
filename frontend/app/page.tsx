import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="text-center">
        <h1 className="text-2xl font-semibold mb-4">Pricing the Heat</h1>
        <Link href="/simulate" className="text-blue-600 underline">
          Go to policy simulator
        </Link>
      </div>
    </main>
  );
}
