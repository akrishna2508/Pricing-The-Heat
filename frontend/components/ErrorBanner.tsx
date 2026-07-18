export function ErrorBanner({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded border border-red-200 bg-red-50 text-red-800 px-4 py-3 text-sm">
      {message}
    </div>
  );
}
