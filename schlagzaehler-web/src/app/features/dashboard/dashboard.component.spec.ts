import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { DeviceManagerService } from '../../core/device/services/device-manager.service';
import { WebSerialTransportFactory } from '../../core/device/transport/web-serial-transport-factory.service';
import { DashboardComponent } from './dashboard.component';

class MockWebSerialFactory {
  supported = true;
  isSupported(): boolean {
    return this.supported;
  }
  async requestPort(): Promise<SerialPort> {
    return {} as SerialPort;
  }
}

describe('DashboardComponent', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let component: DashboardComponent;
  let deviceManager: DeviceManagerService;
  let mockFactory: MockWebSerialFactory;

  const setupComponent = (isSupported = true) => {
    mockFactory = new MockWebSerialFactory();
    mockFactory.supported = isSupported;

    TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideRouter([]),
        DeviceManagerService,
        { provide: WebSerialTransportFactory, useValue: mockFactory },
      ],
    });

    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    deviceManager = TestBed.inject(DeviceManagerService);
    fixture.detectChanges();
  };

  it('should create the dashboard component', () => {
    setupComponent();
    expect(component).toBeTruthy();
  });

  it('should render header and connect device button', () => {
    setupComponent();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Schlagzähler');

    const connectBtn = compiled.querySelector(
      '[data-testid="connect-device-button"]',
    ) as HTMLButtonElement;
    expect(connectBtn).toBeTruthy();
    expect(connectBtn.disabled).toBe(false);
  });

  it('should display unsupported warning when Web Serial is not supported', () => {
    setupComponent(false);
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Web Serial not supported');

    const connectBtn = compiled.querySelector(
      '[data-testid="connect-device-button"]',
    ) as HTMLButtonElement;
    expect(connectBtn.disabled).toBe(true);
  });

  it('should trigger connectSerialDevice when connect button is clicked', async () => {
    setupComponent();
    let connectCalled = false;
    deviceManager.connectSerialDevice = async () => {
      connectCalled = true;
      return null;
    };

    const connectBtn = fixture.nativeElement.querySelector(
      '[data-testid="connect-device-button"]',
    ) as HTMLButtonElement;
    connectBtn.click();

    expect(connectCalled).toBe(true);
  });
});
