import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
// Note: concurrency is set in Lambda payload, not here (CLI config only)
Config.setCodec('h264');
Config.setPixelFormat('yuv420p');

export default Config;
