/**
 * Minimal type shims for the Bootstrap 5.3 JS components we use. We import the
 * individual ESM modules (`bootstrap/js/dist/modal`, `.../toast`) so the bundle
 * stays small and pulls no Popper — but the npm `bootstrap` package ships no
 * TypeScript types, so we declare the tiny surface we call here.
 */
declare module "bootstrap/js/dist/modal" {
  interface ModalOptions {
    backdrop?: boolean | "static";
    keyboard?: boolean;
    focus?: boolean;
  }
  export default class Modal {
    constructor(element: Element, options?: Partial<ModalOptions>);
    show(): void;
    hide(): void;
    dispose(): void;
    static getOrCreateInstance(element: Element, options?: Partial<ModalOptions>): Modal;
  }
}

declare module "bootstrap/js/dist/toast" {
  interface ToastOptions {
    animation?: boolean;
    autohide?: boolean;
    delay?: number;
  }
  export default class Toast {
    constructor(element: Element, options?: Partial<ToastOptions>);
    show(): void;
    hide(): void;
    dispose(): void;
  }
}
