declare module 'jzz' {
  function JZZ(): JZZ.Engine;
  namespace JZZ {
    interface Engine extends Promise<Engine> {
      info(): { inputs: PortInfo[]; outputs: PortInfo[] };
      openMidiIn(name?: string): MidiPort;
      openMidiOut(name?: string): MidiPort;
    }
    interface PortInfo {
      name: string;
      manufacturer: string;
    }
    interface MidiPort extends Promise<MidiPort> {
      send(data: number[]): MidiPort;
      connect(handler: (msg: number[]) => void): MidiPort;
      disconnect(handler: (msg: number[]) => void): MidiPort;
      close(): Promise<void>;
      name(): string;
    }
  }
  export = JZZ;
}
