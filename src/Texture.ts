import type { TextureSource } from './types';
import { EventDispatcher } from './EventDispatcher';
import { isPowerOfTwo } from './webgl-utils';

const defaultImage = document.createElement( 'canvas' );
defaultImage.width = 2;
defaultImage.height = 2;

export class Texture extends EventDispatcher {

	image?: TextureSource;
	texture: WebGLTexture;
	private _gl: WebGLRenderingContext;

	constructor( gl: WebGLRenderingContext, image?: TextureSource ) {

		super();

		this.image = image;
		this._gl = gl;
		this.texture = gl.createTexture()!;
		gl.bindTexture( gl.TEXTURE_2D, this.texture );
		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			gl.RGBA,
			1,
			1,
			0,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			new Uint8Array( [ 0, 0, 0, 255 ] ),
		);

		if ( !! this.image ) {

			this.onLoad();

		} else {

			this.setImage();

		}

	}

	get isLoaded(): boolean {

		if ( ! this.image ) return false;
		if ( this.image instanceof HTMLCanvasElement ) return true;
		if ( this.image instanceof HTMLVideoElement ) return true;
		return this.image.naturalWidth !== 0;

	}

	onLoad(): void {

		if ( ! this.image ) return;

		const onLoad = () => {

			if ( ! this.image ) return;
			this.image.removeEventListener( 'load', onLoad );
			this.setImage( this.image );

		};

		if ( this.isLoaded ) {

			this.setImage( this.image );
			return;

		}

		this.image.addEventListener( 'load', onLoad ); // todo once?

	}

	setImage( image?: TextureSource ): void {

		const _gl = this._gl;
		let _image: TextureSource;

		this.image = image;

		if ( ! this.image ) {

			_image = defaultImage;

		} else if ( this.isLoaded ) {

			_image = this.image;

		} else {

			_image = defaultImage;
			this.onLoad();

		}

		if ( ! _gl ) {

			this.dispatchEvent( { type: 'updated' } );
			return;

		}

		const width  = _image instanceof HTMLImageElement ? _image.naturalWidth  : _image.width;
		const height = _image instanceof HTMLImageElement ? _image.naturalHeight : _image.height;
		const isPowerOfTwoSize = isPowerOfTwo( width ) && isPowerOfTwo( height );

		_gl.bindTexture( _gl.TEXTURE_2D, this.texture );
		_gl.pixelStorei( _gl.UNPACK_FLIP_Y_WEBGL, true );
		_gl.texParameteri( _gl.TEXTURE_2D, _gl.TEXTURE_MIN_FILTER, isPowerOfTwoSize ? _gl.LINEAR_MIPMAP_NEAREST : _gl.LINEAR );
		_gl.texParameteri( _gl.TEXTURE_2D, _gl.TEXTURE_MAG_FILTER, _gl.LINEAR );
		_gl.texParameteri( _gl.TEXTURE_2D, _gl.TEXTURE_WRAP_S, _gl.CLAMP_TO_EDGE );
		_gl.texParameteri( _gl.TEXTURE_2D, _gl.TEXTURE_WRAP_T, _gl.CLAMP_TO_EDGE );
		_gl.texImage2D( _gl.TEXTURE_2D, 0, _gl.RGBA, _gl.RGBA, _gl.UNSIGNED_BYTE, _image );

		if ( isPowerOfTwoSize ) _gl.generateMipmap( _gl.TEXTURE_2D );
		_gl.bindTexture( _gl.TEXTURE_2D, null );

		this.dispatchEvent( { type: 'updated' } );

	}

}
