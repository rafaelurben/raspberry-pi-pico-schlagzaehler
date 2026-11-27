import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { PageHeaderComponent } from './page-header.component';

@Component({
  imports: [PageHeaderComponent],
  template: `
    <app-page-header [title]="title()" [subtitle]="subtitle()">
      @if (showIcon()) {
        <div icon data-testid="test-icon">Icon</div>
      }
      <button type="button" data-testid="test-action">Action</button>
    </app-page-header>
  `,
})
class TestHostComponent {
  readonly title = signal<string>('Test Title');
  readonly subtitle = signal<string | undefined>('Test Subtitle');
  readonly showIcon = signal<boolean>(false);
}

describe('PageHeaderComponent', () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let host: TestHostComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent, PageHeaderComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders title and subtitle', () => {
    const el = fixture.nativeElement as HTMLElement;
    const h1 = el.querySelector('h1');
    const p = el.querySelector('p');

    expect(h1?.textContent?.trim()).toBe('Test Title');
    expect(p?.textContent?.trim()).toBe('Test Subtitle');
  });

  it('does not render subtitle element when subtitle is undefined', () => {
    host.subtitle.set(undefined);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const p = el.querySelector('p');
    expect(p).toBeNull();
  });

  it('projects children into actions container', () => {
    const el = fixture.nativeElement as HTMLElement;
    const actionBtn = el.querySelector('[data-testid="test-action"]');
    expect(actionBtn).toBeTruthy();
    expect(actionBtn?.textContent?.trim()).toBe('Action');
  });

  it('projects icon into icon slot when provided', () => {
    host.showIcon.set(true);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const icon = el.querySelector('[data-testid="test-icon"]');
    expect(icon).toBeTruthy();
    expect(icon?.textContent?.trim()).toBe('Icon');
  });
});
