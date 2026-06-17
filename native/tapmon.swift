// tapmon.swift — stream live loudness (RMS dB) + crowd-band fraction from a Core Audio
// process tap, one line per ~50ms block, forever. Feeds admon.py for ad detection.
// Build: swiftc -O tapmon.swift -o tapmon -framework CoreAudio -framework AudioToolbox -framework AVFoundation
// Run:   ./tapmon            (prints "ts_ms rms_db band_frac" per block to stdout)
import Foundation
import CoreAudio
import AudioToolbox
import Accelerate

func die(_ m: String) -> Never { FileHandle.standardError.write((m+"\n").data(using:.utf8)!); exit(1) }

let tapDesc = CATapDescription(stereoGlobalTapButExcludeProcesses: [])
tapDesc.isPrivate = true
tapDesc.muteBehavior = .unmuted
var tapID = AudioObjectID(kAudioObjectUnknown)
if AudioHardwareCreateProcessTap(tapDesc, &tapID) != noErr { die("tap create failed") }
defer { AudioHardwareDestroyProcessTap(tapID) }

let desc: [String: Any] = [
    kAudioAggregateDeviceNameKey as String: "AdMuteMon",
    kAudioAggregateDeviceUIDKey as String: "com.admute.tapmon.agg",
    kAudioAggregateDeviceIsPrivateKey as String: true,
    kAudioAggregateDeviceMainSubDeviceKey as String: "",
    kAudioAggregateDeviceTapListKey as String: [[
        kAudioSubTapUIDKey as String: tapDesc.uuid.uuidString,
        kAudioSubTapDriftCompensationKey as String: true ]],
    kAudioAggregateDeviceTapAutoStartKey as String: true,
]
var aggID = AudioObjectID(kAudioObjectUnknown)
if AudioHardwareCreateAggregateDevice(desc as CFDictionary, &aggID) != noErr { die("agg create failed") }
defer { AudioHardwareDestroyAggregateDevice(aggID) }

var fmt = AudioStreamBasicDescription()
var sz = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
var addr = AudioObjectPropertyAddress(mSelector: kAudioDevicePropertyStreamFormat,
    mScope: kAudioObjectPropertyScopeInput, mElement: 0)
if AudioObjectGetPropertyData(aggID, &addr, 0, nil, &sz, &fmt) != noErr { die("fmt failed") }
let sr = fmt.mSampleRate
let ch = Int(fmt.mChannelsPerFrame)
FileHandle.standardError.write("tapmon: sr=\(sr) ch=\(ch)\n".data(using:.utf8)!)

// accumulate ~50ms blocks for a stable RMS + a coarse band-energy ratio via FFT
let blockFrames = Int(sr * 0.05)
var acc = [Float](); acc.reserveCapacity(blockFrames*2)
let log2n = vDSP_Length(11)            // 2048-pt FFT for band fraction
let fftN = 1 << 11
let fft = vDSP_create_fftsetup(log2n, FFTRadix(kFFTRadix2))!
var window = [Float](repeating: 0, count: fftN)
vDSP_hann_window(&window, vDSP_Length(fftN), Int32(vDSP_HANN_NORM))
let startTime = ProcessInfo.processInfo.systemUptime

func emitBlock(_ mono: [Float]) {
    let n = mono.count
    if n == 0 { return }
    var ms: Float = 0
    vDSP_measqv(mono, 1, &ms, vDSP_Length(n))      // mean square
    let rms = sqrt(ms) + 1e-12
    let db = 20*log10(rms)
    // band fraction (0.2-4kHz / total) on a 2048 window from the block head
    var bandFrac: Float = -1
    if n >= fftN {
        var win = [Float](repeating: 0, count: fftN)
        vDSP_vmul(Array(mono[0..<fftN]), 1, window, 1, &win, 1, vDSP_Length(fftN))
        var real = win, imag = [Float](repeating: 0, count: fftN)
        var mag = [Float](repeating: 0, count: fftN/2)
        real.withUnsafeMutableBufferPointer { rp in imag.withUnsafeMutableBufferPointer { ip in
            var split = DSPSplitComplex(realp: rp.baseAddress!, imagp: ip.baseAddress!)
            win.withUnsafeBufferPointer { wp in
                wp.baseAddress!.withMemoryRebound(to: DSPComplex.self, capacity: fftN/2) { cp in
                    vDSP_ctoz(cp, 2, &split, 1, vDSP_Length(fftN/2)) } }
            vDSP_fft_zrip(fft, &split, 1, log2n, FFTDirection(FFT_FORWARD))
            vDSP_zvmags(&split, 1, &mag, 1, vDSP_Length(fftN/2))
        }}
        let binHz = sr / Double(fftN)
        let lo = Int(200/binHz), hi = min(fftN/2-1, Int(4000/binHz))
        var bandE: Float = 0, totE: Float = 0
        vDSP_sve(Array(mag[lo...hi]), 1, &bandE, vDSP_Length(hi-lo+1))
        vDSP_sve(mag, 1, &totE, vDSP_Length(fftN/2))
        bandFrac = totE > 0 ? bandE/totE : -1
    }
    let ts = Int((ProcessInfo.processInfo.systemUptime - startTime)*1000)
    print("\(ts) \(String(format: "%.2f", db)) \(String(format: "%.3f", bandFrac))")
    fflush(stdout)
}

var procID: AudioDeviceIOProcID?
let r = AudioDeviceCreateIOProcIDWithBlock(&procID, aggID, nil) { (_, inData, _, _, _) in
    let buf0 = withUnsafePointer(to: inData.pointee.mBuffers) {
        UnsafeRawPointer($0).assumingMemoryBound(to: AudioBuffer.self) }
    guard let data = buf0.pointee.mData else { return }
    let total = Int(buf0.pointee.mDataByteSize)/MemoryLayout<Float>.size
    let fp = data.assumingMemoryBound(to: Float.self)
    // interleaved ch -> mono mean
    var i = 0
    while i < total { var s: Float = 0; for c in 0..<ch { s += fp[i+c] }; acc.append(s/Float(ch)); i += ch }
    while acc.count >= blockFrames { emitBlock(Array(acc[0..<blockFrames])); acc.removeFirst(blockFrames) }
}
if r != noErr { die("ioproc failed") }
if AudioDeviceStart(aggID, procID) != noErr { die("start failed") }
RunLoop.current.run()
