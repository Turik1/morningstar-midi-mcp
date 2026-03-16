declare module 'jzz' {
  function JZZ(): Promise<JZZ.Engine>;
  namespace JZZ {
    interface Engine {
      info(): { inputs: PortInfo[]; outputs: PortInfo[] };
      openMidiIn(name?: string): Promise<MidiPort>;
      openMidiOut(name?: string): Promise<MidiPort>;
    }
    interface PortInfo {
      name: string;
      manufacturer: string;
    }
    interface MidiPort {
      send(data: number[]): MidiPort;
      connect(handler: (msg: number[]) => void): MidiPort;
      disconnect(handler: (msg: number[]) => void): MidiPort;
      close(): Promise<void>;
      name(): string;
    }
  }
  export = JZZ;
}
