import { Component, input, output } from '@angular/core';

export type BannerVariant = 'warning' | 'error' | 'info' | 'success';

@Component({
  selector: 'app-banner',
  template: `
    <div
      [class]="bannerClass()"
      [attr.role]="isAlert() ? 'alert' : 'status'"
      [attr.aria-live]="isAlert() ? 'assertive' : 'polite'"
    >
      <div class="flex items-start gap-3">
        <!-- Variant Icon -->
        @switch (variant()) {
          @case ('warning') {
            <svg
              class="h-5 w-5 shrink-0 text-amber-400"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fill-rule="evenodd"
                d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                clip-rule="evenodd"
              />
            </svg>
          }
          @case ('error') {
            <svg
              class="h-5 w-5 shrink-0 text-rose-400"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fill-rule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                clip-rule="evenodd"
              />
            </svg>
          }
          @case ('success') {
            <svg
              class="h-5 w-5 shrink-0 text-emerald-400"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fill-rule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                clip-rule="evenodd"
              />
            </svg>
          }
          @default {
            <svg
              class="h-5 w-5 shrink-0 text-sky-400"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fill-rule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
                clip-rule="evenodd"
              />
            </svg>
          }
        }

        <!-- Content Area -->
        <div class="flex-1 min-w-0">
          @if (title(); as bannerTitle) {
            <h3 class="text-sm font-semibold" [class]="titleColorClass()">
              {{ bannerTitle }}
            </h3>
          }
          <div [class]="bodyClass()">
            <ng-content />
          </div>
        </div>

        <!-- Optional Dismiss Button -->
        @if (dismissible()) {
          <button
            type="button"
            (click)="dismiss.emit()"
            class="shrink-0 -mr-1 -mt-1 rounded-lg p-1.5 text-slate-400 hover:text-white transition-colors cursor-pointer"
            aria-label="Dismiss banner"
          >
            <svg
              class="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        }
      </div>
    </div>
  `,
})
export class BannerComponent {
  readonly variant = input<BannerVariant>('info');
  readonly title = input<string>();
  readonly dismissible = input<boolean>(false);
  readonly dismiss = output<void>();

  protected isAlert(): boolean {
    return this.variant() === 'error' || this.variant() === 'warning';
  }

  protected bannerClass(): string {
    const variantClass = {
      warning: 'sz-banner-warning',
      error: 'sz-banner-danger',
      info: 'sz-banner-info',
      success: 'sz-banner-success',
    }[this.variant()];

    return `sz-banner ${variantClass}`;
  }

  protected titleColorClass(): string {
    return {
      warning: 'text-amber-300',
      error: 'text-rose-300',
      info: 'text-sky-300',
      success: 'text-emerald-300',
    }[this.variant()];
  }

  protected bodyClass(): string {
    const hasTitle = Boolean(this.title());
    const margin = hasTitle ? 'mt-1' : '';
    return `${margin} text-xs leading-relaxed`;
  }
}
