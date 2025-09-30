import { Toast, ToastDescription, ToastTitle, ToastViewport, ToastProvider } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map(({ id, title, description, action, tone, ...props }) => (
        <Toast key={id} tone={tone} {...props}>
          <div className="flex flex-1 flex-col gap-1">
            {title ? <ToastTitle>{title}</ToastTitle> : null}
            {description ? <ToastDescription>{description}</ToastDescription> : null}
          </div>
          {action}
        </Toast>
      ))}
      <ToastViewport className="fixed right-4 top-4 z-toast flex max-h-screen w-full max-w-sm flex-col gap-3 p-4" />
    </ToastProvider>
  );
}
