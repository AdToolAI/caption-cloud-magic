import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
// Note: concurrency is set in Lambda payload, not here (CLI config only)
Config.setCodec('h264');
Config.setPixelFormat('yuv420p');
// Visually-lossless export floor — must match render-with-remotion Lambda payload.
// See mem://architecture/render/global-export-quality-floor.md
Config.setJpegQuality(95);
Config.setCrf(16);
Config.setAudioBitrate('256k');
Config.setVideoBitrate('10M');

export default Config;
