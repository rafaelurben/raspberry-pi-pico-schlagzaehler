import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { DeviceManagerService } from '../../core/device/services/device-manager.service';
import { WebSerialTransportFactory } from '../../core/device/transport/web-serial-transport-factory.service';
import { SettingsComponent } from './settings.component';

class MockWebSerialFactory {
  supported = true;
  isSupported(): boolean {
    return this.supported;
  }
  async requestPort(): Promise<SerialPort> {
    return {} as SerialPort;
  }
}

describe('SettingsComponent', () => {
  let fixture: ComponentFixture<SettingsComponent>;
  let component: SettingsComponent;
  let deviceManager: DeviceManagerService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SettingsComponent],
      providers: [
        DeviceManagerService,
        { provide: WebSerialTransportFactory, useClass: MockWebSerialFactory },
      ],
    });

    fixture = TestBed.createComponent(SettingsComponent);
    component = fixture.componentInstance;
    deviceManager = TestBed.inject(DeviceManagerService);
    fixture.detectChanges();
  });

  it('should create the settings component with device list and live events', () => {
    expect(component).toBeTruthy();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Device Settings');
    expect(compiled.querySelector('app-device-list')).toBeTruthy();
    expect(compiled.querySelector('app-event-list')).toBeTruthy();
  });

  it('should pass optional custom name to connectSerialDevice', async () => {
    let passedName: string | undefined;
    deviceManager.connectSerialDevice = async (name?: string) => {
      passedName = name;
      return null;
    };

    component.newDeviceName.set('Custom Pico');
    await component.onConnectDevice();

    expect(passedName).toBe('Custom Pico');
  });
});
