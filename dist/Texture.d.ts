import type { TextureSource } from './types';
import { EventDispatcher } from './EventDispatcher';
export declare class Texture extends EventDispatcher {
    image?: TextureSource;
    texture: WebGLTexture;
    private _gl;
    constructor(gl: WebGLRenderingContext, image?: TextureSource);
    get isLoaded(): boolean;
    onLoad(): void;
    setImage(image?: TextureSource): void;
}
