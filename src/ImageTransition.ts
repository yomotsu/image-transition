import type { TextureSource } from './types';
import { EventDispatcher } from './EventDispatcher';
import { MAX_TEXTURE_SIZE, getWebglContext, ceilPowerOfTwo, isPowerOfTwo } from './webgl-utils';
import { Texture } from './Texture';
import {
	VERTEX_SHADER_SOURCE,
	FRAGMENT_SHADER_SOURCE,
} from './shader';

const VERTEXES = new Float32Array( [
	- 1, - 1,
	  1, - 1,
	- 1,   1,
	  1, - 1,
	  1,   1,
	- 1,   1,
] );

const UV = new Float32Array( [
	0.0, 0.0,
	1.0, 0.0,
	0.0, 1.0,
	1.0, 0.0,
	1.0, 1.0,
	0.0, 1.0,
] );

type Params = {
	canvas: HTMLCanvasElement,
	intensity?: number,
	direction?: number,
	duration?: number,
	sourceFrom?: TextureSource,
	sourceTo?: TextureSource,
	displacementSource: TextureSource,
}

export class ImageTransition extends EventDispatcher {

	static loadImage( imageSource: string ): Promise<HTMLImageElement> {

		return new Promise( ( resolve ) => {

			const img = new Image();
			const onLoad = () => {

				img.removeEventListener( 'load', onLoad );
				resolve( img );

			}
			img.addEventListener( 'load', onLoad );
			img.src = imageSource;

		} );

	}

	static convertPowerOfTwo( image: HTMLImageElement | HTMLCanvasElement ): TextureSource {

		const isImageElement = image instanceof HTMLImageElement;

		if ( isImageElement && image.naturalWidth === 0 ) {

			console.warn( 'The image must be loaded before conversion.' );
			return image;

		}

		const canvas = document.createElement( 'canvas' );
		const imageWidth = isImageElement ? image.naturalWidth : image.width;
		const imageHeight = isImageElement ? image.naturalHeight : image.height;
		const width = Math.min( ceilPowerOfTwo( imageWidth ), MAX_TEXTURE_SIZE );
		const height = Math.min( ceilPowerOfTwo( imageHeight ), MAX_TEXTURE_SIZE );

		if ( isPowerOfTwo( width ) && isPowerOfTwo( height ) ) return image;
		canvas.width = width;
		canvas.height = height;

		canvas.getContext( '2d' )?.drawImage( image, 0, 0, width, height );
		return canvas;

	}

	duration: number;

	private _progress: number = 0;
	private _canvas: HTMLCanvasElement;
	private _textureFrom: Texture;
	private _textureTo: Texture;
	private _textureDisplacement: Texture;
	private _isEntering: boolean = false;
	private _isLeaving: boolean = false;
	private _hasUpdated: boolean = true;
	private _destroyed: boolean = false;

	private _gl: WebGLRenderingContext;
	private _vertexShader: WebGLShader;
	private _fragmentShader: WebGLShader | null;
	private _program: WebGLProgram | null;
	private _vertexBuffer: WebGLBuffer;
	private _uvBuffer: WebGLBuffer;
	private _uniformLocations: {
		intensity:           WebGLUniformLocation | null,
		direction:           WebGLUniformLocation | null, // in radian
		progress:            WebGLUniformLocation | null,
		uvScale:             WebGLUniformLocation | null,
		textureFrom:         WebGLUniformLocation | null,
		textureTo:           WebGLUniformLocation | null,
		textureDisplacement: WebGLUniformLocation | null,
		disableFromImage:    WebGLUniformLocation | null,
		disableToImage:      WebGLUniformLocation | null,
	};

	constructor( {
		canvas,
		intensity = 1,
		duration = 2000,
		direction = 0,
		sourceFrom,
		sourceTo,
		displacementSource,
	}: Params ) {

		super();

		this._canvas = canvas;
		this.duration = duration;

		this._gl = getWebglContext( canvas );
		this._vertexBuffer = this._gl.createBuffer()!;
		this._uvBuffer = this._gl.createBuffer()!;

		this._vertexShader = this._gl.createShader( this._gl.VERTEX_SHADER )!;
		this._gl.shaderSource( this._vertexShader, VERTEX_SHADER_SOURCE );
		this._gl.compileShader( this._vertexShader );

		this._fragmentShader = this._gl.createShader( this._gl.FRAGMENT_SHADER )!;
		this._gl.shaderSource( this._fragmentShader, FRAGMENT_SHADER_SOURCE );
		this._gl.compileShader( this._fragmentShader );

		this._program = this._gl.createProgram()!;
		this._gl.attachShader( this._program, this._vertexShader );
		this._gl.attachShader( this._program, this._fragmentShader );
		this._gl.linkProgram( this._program );
		this._gl.useProgram( this._program );

		// http://webos-goodies.jp/archives/overlaying_webgl_on_html.html
		this._gl.enable( this._gl.BLEND );
		this._gl.blendFuncSeparate(
			this._gl.SRC_ALPHA,
			this._gl.ONE_MINUS_SRC_ALPHA,
			this._gl.ONE,
			this._gl.ZERO,
		);

		// vertexes
		this._gl.bindBuffer( this._gl.ARRAY_BUFFER, this._vertexBuffer );
		this._gl.bufferData( this._gl.ARRAY_BUFFER, VERTEXES, this._gl.STATIC_DRAW );

		const position = this._gl.getAttribLocation( this._program, 'position' );
		this._gl.vertexAttribPointer( position, 2, this._gl.FLOAT, false, 0, 0 );
		this._gl.enableVertexAttribArray( position );

		// uv attr
		this._gl.bindBuffer( this._gl.ARRAY_BUFFER, this._uvBuffer );
		this._gl.bufferData( this._gl.ARRAY_BUFFER, UV, this._gl.STATIC_DRAW );

		const uv = this._gl.getAttribLocation( this._program, 'uv' );
		this._gl.vertexAttribPointer( uv, 2, this._gl.FLOAT, false, 0, 0 );
		this._gl.enableVertexAttribArray( uv );

		this._uniformLocations = {
			intensity:           this._gl.getUniformLocation( this._program, 'intensity' ),
			direction:           this._gl.getUniformLocation( this._program, 'direction' ),
			progress:            this._gl.getUniformLocation( this._program, 'progress' ),
			uvScale:             this._gl.getUniformLocation( this._program, 'uvScale' ),
			textureFrom:         this._gl.getUniformLocation( this._program, 'textureFrom' ),
			textureTo:           this._gl.getUniformLocation( this._program, 'textureTo' ),
			textureDisplacement: this._gl.getUniformLocation( this._program, 'textureDisplacement' ),
			disableFromImage:    this._gl.getUniformLocation( this._program, 'disableFromImage' ),
			disableToImage:      this._gl.getUniformLocation( this._program, 'disableToImage' ),
		};

		this._gl.uniform1f( this._uniformLocations.intensity, intensity );
		this._gl.uniform1f( this._uniformLocations.direction, direction );

		this._textureFrom = new Texture( this._gl, sourceFrom );
		this._textureTo = new Texture( this._gl, sourceTo );
		this._textureDisplacement = new Texture( this._gl, displacementSource );

		this._textureFrom.addEventListener( 'updated', this._updateTexture.bind( this ) );
		this._textureTo.addEventListener( 'updated', this._updateTexture.bind( this ) );
		this._textureDisplacement.addEventListener( 'updated', this._updateTexture.bind( this ) );

		this._updateTexture();
		this.setSize( this._canvas.width, this._canvas.height );

		return this;

	}

	enter() {

		if ( this._isEntering ) return;
		if ( this._progress === 1 ) return;

		this._isEntering = true;
		this._isLeaving = false;
		const startTime = performance.now();
		const startElapsedTime = this.duration * this._progress;

		const tick = () => {

			if ( this._destroyed ) return;
			if ( ! this._isEntering ) return;

			const elapsedTime = performance.now() - startTime + startElapsedTime;
			this._progress = clamp( elapsedTime / this.duration, 0, 1 );

			this.render();

			if ( this._progress === 1 ) {

				this._isEntering = false;
				this.dispatchEvent( { type: 'transitionEnd' } );

			}

			requestAnimationFrame( tick );

		};

		tick();

	}

	leave() {

		if ( this._isLeaving ) return;
		if ( this._progress === 0 ) return;

		this._isLeaving = true;
		this._isEntering = false;
		const startTime = performance.now();
		const startElapsedTime = this.duration * ( 1 - this._progress );

		const tick = () => {

			if ( this._destroyed ) return;
			if ( ! this._isLeaving ) return;

			const elapsedTime = performance.now() - startTime + startElapsedTime;
			this._progress = clamp( 1 - elapsedTime / this.duration, 0, 1 );

			this.render();

			if ( this._progress === 0 ) {

				this._isLeaving = false;
				this.dispatchEvent( { type: 'transitionEnd' } );

			}

			requestAnimationFrame( tick );

		};

		tick();

	}

	stop() {

		if ( ! this._isEntering && ! this._isLeaving ) return;

		this._isEntering = false;
		this._isLeaving = false;
		this.dispatchEvent( { type: 'transitionEnd' } );

	}

	reset() {

		this.stop();
		this._progress = 0;
		this.render();

	}

	setSize( w: number, h: number ) {

		if ( this._canvas.width  === w && this._canvas.height === h ) return;

		this._canvas.width  = w;
		this._canvas.height = h;
		this._gl.viewport( 0, 0, w, h );

		// update vertex buffer
		this._updateAspect();

	}

	setFromImage( sourceFrom: TextureSource ) {

		this._textureFrom.setImage( sourceFrom );

	}

	setToImage( sourceTo: TextureSource ) {

		this._textureTo.setImage( sourceTo );

	}

	render() {

		if ( this._destroyed ) return;

		this._gl.clearColor( 0, 0, 0, 0 );
		this._gl.uniform1f( this._uniformLocations.progress, easeInOutSine( this._progress ) );
		this._gl.clear( this._gl.COLOR_BUFFER_BIT | this._gl.DEPTH_BUFFER_BIT );
		this._gl.drawArrays( this._gl.TRIANGLES, 0, 6 );
		this._gl.flush();

		if ( this._progress === 1 ) this._hasUpdated = false;

	}

	destroy( removeElement = false ) {

		this._destroyed = true;
		this._isEntering = false;
		this._isLeaving = false;

		if ( removeElement ) this.setSize( 1, 1 );

		if ( this._program ) {

			// https://stackoverflow.com/a/23606581/1512272
			this._gl.activeTexture( this._gl.TEXTURE0 );
			this._gl.bindTexture( this._gl.TEXTURE_2D, null );
			this._gl.activeTexture( this._gl.TEXTURE1 );
			this._gl.bindTexture( this._gl.TEXTURE_2D, null );
			this._gl.activeTexture( this._gl.TEXTURE2 );
			this._gl.bindTexture( this._gl.TEXTURE_2D, null );
			this._gl.bindBuffer( this._gl.ARRAY_BUFFER, null );

			this._gl.deleteTexture( this._textureFrom.texture );
			this._gl.deleteTexture( this._textureTo.texture );
			this._gl.deleteTexture( this._textureDisplacement.texture );
			this._gl.deleteBuffer( this._vertexBuffer );
			this._gl.deleteBuffer( this._uvBuffer );
			this._gl.deleteShader( this._vertexShader );
			this._gl.deleteShader( this._fragmentShader );
			this._gl.deleteProgram( this._program );

		}

		if ( removeElement && !! this._canvas.parentNode ) {

			this._canvas.parentNode.removeChild( this._canvas );

		}

	}

	private _updateTexture() {

		this._gl.activeTexture( this._gl.TEXTURE0 );
		this._gl.bindTexture( this._gl.TEXTURE_2D, this._textureFrom.texture );
		this._gl.uniform1i( this._uniformLocations.textureFrom, 0 );

		this._gl.activeTexture( this._gl.TEXTURE1 );
		this._gl.bindTexture( this._gl.TEXTURE_2D, this._textureTo.texture );
		this._gl.uniform1i( this._uniformLocations.textureTo, 1 );

		this._gl.activeTexture( this._gl.TEXTURE2 );
		this._gl.bindTexture( this._gl.TEXTURE_2D, this._textureDisplacement.texture );
		this._gl.uniform1i( this._uniformLocations.textureDisplacement, 2 );

		this._gl.uniform1f( this._uniformLocations.disableFromImage, this._textureFrom.image ? 0 : 1 );
		this._gl.uniform1f( this._uniformLocations.disableToImage, this._textureTo.image ? 0 : 1 );

		this._updateAspect();

	}

	private _updateAspect() {

		// update vertex buffer
		const canvasAspect = this._canvas.width / this._canvas.height;
		const image = this._textureFrom.image ? this._textureFrom.image : this._textureTo.image;
		const mediaAspect =
			image instanceof HTMLImageElement ? image.naturalWidth / image.naturalHeight :
			image instanceof HTMLCanvasElement ? image.width / image.height :
			1;
		const aspect = mediaAspect / canvasAspect;

		if ( aspect < 1.0 ) {

			this._gl.uniform2f( this._uniformLocations.uvScale, 1, aspect );

		} else {

			this._gl.uniform2f( this._uniformLocations.uvScale, 1 / aspect, 1 );

		}

		this._onUpdate();

	}

	private _onUpdate() {

		if ( this._isEntering || this._isLeaving ) return; // no need to render here. will be rendered anyway
		if ( this._hasUpdated ) return;

		this._hasUpdated = true;

		requestAnimationFrame( () => {

			this.render();
			this._hasUpdated = false;

		} );
	}

}

function clamp( num: number, min: number, max: number ): number {

	return Math.min( Math.max( num, min ), max );

}

function easeInOutSine( x: number ): number {

	return - ( Math.cos( Math.PI * x ) - 1 ) / 2;

}

