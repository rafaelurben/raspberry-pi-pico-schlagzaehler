import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { BannerComponent, BannerVariant } from './banner.component';

@Component({
  imports: [BannerComponent],
  template: `
    <app-banner
      [variant]="variant()"
      [title]="title()"
      [dismissible]="dismissible()"
      (dismiss)="onDismiss()"
    >
      {{ content() }}
    </app-banner>
  `,
})
class TestHostComponent {
  readonly variant = signal<BannerVariant>('info');
  readonly title = signal<string | undefined>(undefined);
  readonly dismissible = signal<boolean>(false);
  readonly content = signal<string>('Test message');
  dismissed = false;

  onDismiss() {
    this.dismissed = true;
  }
}

describe('BannerComponent', () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let host: TestHostComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent, BannerComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders default info banner with projected content', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Test message');
    const banner = el.querySelector('[role="status"]');
    expect(banner).toBeTruthy();
    expect(banner?.classList.contains('sz-banner')).toBe(true);
    expect(banner?.classList.contains('sz-banner-info')).toBe(true);
  });

  it('renders warning variant with alert role and title', () => {
    host.variant.set('warning');
    host.title.set('Warning Title');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const banner = el.querySelector('[role="alert"]');
    expect(banner).toBeTruthy();
    expect(banner?.classList.contains('sz-banner-warning')).toBe(true);
    expect(el.querySelector('h3')?.textContent?.trim()).toBe('Warning Title');
  });

  it('renders error variant with alert role', () => {
    host.variant.set('error');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const banner = el.querySelector('[role="alert"]');
    expect(banner).toBeTruthy();
    expect(banner?.classList.contains('sz-banner-danger')).toBe(true);
  });

  it('handles dismissible button click', () => {
    host.dismissible.set(true);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector(
      'button[aria-label="Dismiss banner"]',
    ) as HTMLButtonElement;
    expect(button).toBeTruthy();

    button.click();
    expect(host.dismissed).toBe(true);
  });
});
