import { Component, input } from '@angular/core';

@Component({
  selector: 'app-page-header',
  template: `
    <header class="sz-page-header">
      <div>
        <div class="flex items-center gap-3">
          <ng-content select="[icon]" />
          <div>
            <h1 class="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              {{ title() }}
            </h1>
            @if (subtitle(); as sub) {
              <p class="mt-1 text-xs text-slate-400 sm:text-sm">
                {{ sub }}
              </p>
            }
          </div>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <ng-content />
      </div>
    </header>
  `,
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string>();
}
