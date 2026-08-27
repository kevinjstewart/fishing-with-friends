import type { ToastState } from "../../ui/types";

export interface StatusToastProps {
  message?: string;
  state?: ToastState;
}

export function StatusToast({ message, state = "loading" }: StatusToastProps) {
  const visible = Boolean(message);
  return (
    <div className="status-toast-host" hidden={!visible}>
      {visible ? <div className="toast is-shown" data-state={state} role="status" aria-live="polite" aria-atomic="true"><span>{message}</span></div> : null}
    </div>
  );
}
