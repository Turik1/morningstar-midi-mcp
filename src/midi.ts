import JZZ from 'jzz';

export interface MidiPort {
  name: string;
  manufacturer: string;
}

export class MidiConnection {
  private output: any = null;
  private input: any = null;
  private engine: any = null;
  private connectedPortName: string | null = null;

  isConnected(): boolean {
    return this.output !== null && this.input !== null;
  }

  async listPorts(): Promise<{ inputs: MidiPort[]; outputs: MidiPort[] }> {
    const engine = await JZZ();
    const info = engine.info();
    return {
      inputs: info.inputs.map((p: any) => ({ name: p.name, manufacturer: p.manufacturer })),
      outputs: info.outputs.map((p: any) => ({ name: p.name, manufacturer: p.manufacturer })),
    };
  }

  async connect(portName?: string): Promise<string> {
    this.engine = await JZZ();
    const info = this.engine.info();

    const findPort = (ports: any[], name?: string) => {
      if (name) {
        return ports.find((p: any) => p.name.includes(name));
      }
      return ports.find((p: any) => p.name.toLowerCase().includes('morningstar'));
    };

    const outputPort = findPort(info.outputs, portName);
    const inputPort = findPort(info.inputs, portName);

    if (!outputPort || !inputPort) {
      const available = info.outputs.map((p: any) => p.name).join(', ');
      throw new Error(`Morningstar controller not found. Available ports: ${available || 'none'}`);
    }

    this.output = await this.engine.openMidiOut(outputPort.name);
    this.input = await this.engine.openMidiIn(inputPort.name);
    this.connectedPortName = outputPort.name;

    return outputPort.name;
  }

  async sendAndReceive(sysex: number[], timeoutMs: number = 2000): Promise<number[]> {
    if (!this.isConnected()) {
      throw new Error('Not connected to a MIDI device');
    }

    // Retry once on timeout per spec
    try {
      return await this.sendAndReceiveOnce(sysex, timeoutMs);
    } catch (err) {
      if (err instanceof Error && err.message.includes('timeout')) {
        return await this.sendAndReceiveOnce(sysex, timeoutMs);
      }
      throw err;
    }
  }

  private sendAndReceiveOnce(sysex: number[], timeoutMs: number): Promise<number[]> {
    return new Promise<number[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.input.disconnect(handler);
        reject(new Error(`SysEx timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      const handler = (msg: any) => {
        const data: number[] = Array.from(msg);
        if (data[0] === 0xF0 && data[1] === 0x00 && data[2] === 0x21 && data[3] === 0x24) {
          clearTimeout(timer);
          this.input.disconnect(handler);
          resolve(data);
        }
      };

      this.input.connect(handler);
      this.output.send(sysex);
    });
  }

  async send(sysex: number[]): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Not connected to a MIDI device');
    }
    this.output.send(sysex);
  }

  async checkConnection(): Promise<boolean> {
    if (!this.engine) return false;
    try {
      const info = this.engine.info();
      const portStillExists = info.outputs.some((p: any) => p.name === this.connectedPortName);
      if (!portStillExists) {
        await this.disconnect();
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.output) {
      await this.output.close();
      this.output = null;
    }
    if (this.input) {
      await this.input.close();
      this.input = null;
    }
    this.connectedPortName = null;
  }
}
