/*!
 * @author yomotsu
 * image-transition
 * https://github.com/yomotsu/image-transition
 * Released under the MIT License.
 */
class EventDispatcher {
    constructor() {
        this._listeners = {};
    }
    addEventListener(type, listener) {
        const listeners = this._listeners;
        if (listeners[type] === undefined)
            listeners[type] = [];
        if (listeners[type].indexOf(listener) === -1) {
            listeners[type].push(listener);
        }
    }
    hasEventListener(type, listener) {
        const listeners = this._listeners;
        return listeners[type] !== undefined && listeners[type].indexOf(listener) !== -1;
    }
    removeEventListener(type, listener) {
        const listeners = this._listeners;
        const listenerArray = listeners[type];
        if (listenerArray !== undefined) {
            const index = listenerArray.indexOf(listener);
            if (index !== -1)
                listenerArray.splice(index, 1);
        }
    }
    dispatchEvent(event) {
        const listeners = this._listeners;
        const listenerArray = listeners[event.type];
        if (listenerArray !== undefined) {
            event.target = this;
            const array = listenerArray.slice(0);
            for (let i = 0, l = array.length; i < l; i++) {
                array[i].call(this, event);
            }
        }
    }
}

function getWebglContext(canvas, contextAttributes) {
    return (canvas.getContext('webgl', contextAttributes) ||
        canvas.getContext('experimental-webgl', contextAttributes));
}
const MAX_TEXTURE_SIZE = (() => {
    const canvas = document.createElement('canvas');
    const gl = getWebglContext(canvas);
    const MAX_TEXTURE_SIZE = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const ext = gl.getExtension('WEBGL_lose_context');
    if (ext)
        ext.loseContext();
    return MAX_TEXTURE_SIZE;
})();
function ceilPowerOfTwo(value) {
    return Math.pow(2, Math.ceil(Math.log(value) / Math.LN2));
}
function isPowerOfTwo(value) {
    return (value & (value - 1)) === 0 && value !== 0;
}

const defaultImage = document.createElement('canvas');
defaultImage.width = 2;
defaultImage.height = 2;
class Texture extends EventDispatcher {
    constructor(gl, image) {
        super();
        this.image = image;
        this._gl = gl;
        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
        if (!!this.image) {
            this.onLoad();
        }
        else {
            this.setImage();
        }
    }
    get isLoaded() {
        if (!this.image)
            return false;
        if (this.image instanceof HTMLCanvasElement)
            return true;
        if (this.image instanceof HTMLVideoElement)
            return true;
        return this.image.naturalWidth !== 0;
    }
    onLoad() {
        if (!this.image)
            return;
        const onLoad = () => {
            if (!this.image)
                return;
            this.image.removeEventListener('load', onLoad);
            this.setImage(this.image);
        };
        if (this.isLoaded) {
            this.setImage(this.image);
            return;
        }
        this.image.addEventListener('load', onLoad);
    }
    setImage(image) {
        const _gl = this._gl;
        let _image;
        this.image = image;
        if (!this.image) {
            _image = defaultImage;
        }
        else if (this.isLoaded) {
            _image = this.image;
        }
        else {
            _image = defaultImage;
            this.onLoad();
        }
        if (!_gl) {
            this.dispatchEvent({ type: 'updated' });
            return;
        }
        const width = _image instanceof HTMLImageElement ? _image.naturalWidth : _image.width;
        const height = _image instanceof HTMLImageElement ? _image.naturalHeight : _image.height;
        const isPowerOfTwoSize = isPowerOfTwo(width) && isPowerOfTwo(height);
        _gl.bindTexture(_gl.TEXTURE_2D, this.texture);
        _gl.pixelStorei(_gl.UNPACK_FLIP_Y_WEBGL, true);
        _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_MIN_FILTER, isPowerOfTwoSize ? _gl.LINEAR_MIPMAP_NEAREST : _gl.LINEAR);
        _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_MAG_FILTER, _gl.LINEAR);
        _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_WRAP_S, _gl.CLAMP_TO_EDGE);
        _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_WRAP_T, _gl.CLAMP_TO_EDGE);
        _gl.texImage2D(_gl.TEXTURE_2D, 0, _gl.RGBA, _gl.RGBA, _gl.UNSIGNED_BYTE, _image);
        if (isPowerOfTwoSize)
            _gl.generateMipmap(_gl.TEXTURE_2D);
        _gl.bindTexture(_gl.TEXTURE_2D, null);
        this.dispatchEvent({ type: 'updated' });
    }
}

const VERTEX_SHADER_SOURCE = `
attribute vec2 position;
attribute vec2 uv;
uniform vec2 uvScale;
varying vec2 vUv;

void main() {

	gl_Position = vec4( position, 1., 1. );

	vUv = uv;

	if ( uvScale.y < 1.0 ) {

		float offset = ( 1.0 - uvScale.y ) * .5;
		vUv.y = vUv.y * uvScale.y + offset;

	} else {

		float offset = ( 1.0 - uvScale.x ) * .5;
		vUv.x = vUv.x * uvScale.x + offset;

	}

}
`;
const FRAGMENT_SHADER_SOURCE = `
precision highp float;
varying vec2 vUv;
uniform float intensity, direction, progress, disableFromImage, disableToImage;
uniform sampler2D textureFrom, textureTo, textureDisplacement;

float defaultAngle = 3.14159265 / 4.;

mat2 rotationMatrix( float angle ) {

	float s = sin( angle );
	float c = cos( angle );
	return mat2( c, -s, s, c );

}


void main() {

	vec2 displacement = rotationMatrix( defaultAngle + direction ) * texture2D( textureDisplacement, vUv ).xy;
	vec2 distortedPosition1 = vUv + displacement * intensity * progress;
	vec2 distortedPosition2 = vUv + displacement * intensity * ( 1.0 - progress );
	vec4 fromColor = texture2D( textureFrom, distortedPosition1 );
	vec4 toColor = texture2D( textureTo, distortedPosition2 );

	if ( disableFromImage == 1.0 ) {

		if ( distortedPosition2.x < 0.0 || distortedPosition2.x > 1.0 || distortedPosition2.y < 0.0 || distortedPosition2.y > 1.0 ) {

			gl_FragColor = vec4( 0. );

		} else {

			gl_FragColor = vec4( toColor.rgb, toColor.a * progress );

		}

	} else if ( disableToImage == 1.0 ) {

		if ( distortedPosition1.x < 0.0 || distortedPosition1.x > 1.0 || distortedPosition1.y < 0.0 || distortedPosition1.y > 1.0 ) {

			gl_FragColor = vec4( 0. );

		} else {

			gl_FragColor = vec4( fromColor.rgb, fromColor.a * ( 1.0 - progress ) );

		}

	} else {

		gl_FragColor = mix( fromColor, toColor, progress );

	}

}
`;

const VERTEXES = new Float32Array([
    -1, -1,
    1, -1,
    -1, 1,
    1, -1,
    1, 1,
    -1, 1,
]);
const UV = new Float32Array([
    0.0, 0.0,
    1.0, 0.0,
    0.0, 1.0,
    1.0, 0.0,
    1.0, 1.0,
    0.0, 1.0,
]);
class ImageTransition extends EventDispatcher {
    static loadImage(imageSource) {
        return new Promise((resolve) => {
            const img = new Image();
            const onLoad = () => {
                img.removeEventListener('load', onLoad);
                resolve(img);
            };
            img.addEventListener('load', onLoad);
            img.src = imageSource;
        });
    }
    static convertPowerOfTwo(image) {
        var _a;
        const isImageElement = image instanceof HTMLImageElement;
        if (isImageElement && image.naturalWidth === 0) {
            console.warn('The image must be loaded before conversion.');
            return image;
        }
        const canvas = document.createElement('canvas');
        const imageWidth = isImageElement ? image.naturalWidth : image.width;
        const imageHeight = isImageElement ? image.naturalHeight : image.height;
        const width = Math.min(ceilPowerOfTwo(imageWidth), MAX_TEXTURE_SIZE);
        const height = Math.min(ceilPowerOfTwo(imageHeight), MAX_TEXTURE_SIZE);
        if (isPowerOfTwo(width) && isPowerOfTwo(height))
            return image;
        canvas.width = width;
        canvas.height = height;
        (_a = canvas.getContext('2d')) === null || _a === void 0 ? void 0 : _a.drawImage(image, 0, 0, width, height);
        return canvas;
    }
    constructor({ canvas, intensity = 1, duration = 2000, direction = 0, sourceFrom, sourceTo, displacementSource, }) {
        super();
        this._progress = 0;
        this._isEntering = false;
        this._isLeaving = false;
        this._hasUpdated = true;
        this._destroyed = false;
        this._canvas = canvas;
        this.duration = duration;
        this._gl = getWebglContext(canvas);
        this._vertexBuffer = this._gl.createBuffer();
        this._uvBuffer = this._gl.createBuffer();
        this._vertexShader = this._gl.createShader(this._gl.VERTEX_SHADER);
        this._gl.shaderSource(this._vertexShader, VERTEX_SHADER_SOURCE);
        this._gl.compileShader(this._vertexShader);
        this._fragmentShader = this._gl.createShader(this._gl.FRAGMENT_SHADER);
        this._gl.shaderSource(this._fragmentShader, FRAGMENT_SHADER_SOURCE);
        this._gl.compileShader(this._fragmentShader);
        this._program = this._gl.createProgram();
        this._gl.attachShader(this._program, this._vertexShader);
        this._gl.attachShader(this._program, this._fragmentShader);
        this._gl.linkProgram(this._program);
        this._gl.useProgram(this._program);
        this._gl.enable(this._gl.BLEND);
        this._gl.blendFuncSeparate(this._gl.SRC_ALPHA, this._gl.ONE_MINUS_SRC_ALPHA, this._gl.ONE, this._gl.ZERO);
        this._gl.bindBuffer(this._gl.ARRAY_BUFFER, this._vertexBuffer);
        this._gl.bufferData(this._gl.ARRAY_BUFFER, VERTEXES, this._gl.STATIC_DRAW);
        const position = this._gl.getAttribLocation(this._program, 'position');
        this._gl.vertexAttribPointer(position, 2, this._gl.FLOAT, false, 0, 0);
        this._gl.enableVertexAttribArray(position);
        this._gl.bindBuffer(this._gl.ARRAY_BUFFER, this._uvBuffer);
        this._gl.bufferData(this._gl.ARRAY_BUFFER, UV, this._gl.STATIC_DRAW);
        const uv = this._gl.getAttribLocation(this._program, 'uv');
        this._gl.vertexAttribPointer(uv, 2, this._gl.FLOAT, false, 0, 0);
        this._gl.enableVertexAttribArray(uv);
        this._uniformLocations = {
            intensity: this._gl.getUniformLocation(this._program, 'intensity'),
            direction: this._gl.getUniformLocation(this._program, 'direction'),
            progress: this._gl.getUniformLocation(this._program, 'progress'),
            uvScale: this._gl.getUniformLocation(this._program, 'uvScale'),
            textureFrom: this._gl.getUniformLocation(this._program, 'textureFrom'),
            textureTo: this._gl.getUniformLocation(this._program, 'textureTo'),
            textureDisplacement: this._gl.getUniformLocation(this._program, 'textureDisplacement'),
            disableFromImage: this._gl.getUniformLocation(this._program, 'disableFromImage'),
            disableToImage: this._gl.getUniformLocation(this._program, 'disableToImage'),
        };
        this._gl.uniform1f(this._uniformLocations.intensity, intensity);
        this._gl.uniform1f(this._uniformLocations.direction, direction);
        this._textureFrom = new Texture(this._gl, sourceFrom);
        this._textureTo = new Texture(this._gl, sourceTo);
        this._textureDisplacement = new Texture(this._gl, displacementSource);
        this._textureFrom.addEventListener('updated', this._updateTexture.bind(this));
        this._textureTo.addEventListener('updated', this._updateTexture.bind(this));
        this._textureDisplacement.addEventListener('updated', this._updateTexture.bind(this));
        this._updateTexture();
        this.setSize(this._canvas.width, this._canvas.height);
        return this;
    }
    enter() {
        if (this._isEntering)
            return;
        if (this._progress === 1)
            return;
        this._isEntering = true;
        this._isLeaving = false;
        const startTime = performance.now();
        const startElapsedTime = this.duration * this._progress;
        const tick = () => {
            if (this._destroyed)
                return;
            if (!this._isEntering)
                return;
            const elapsedTime = performance.now() - startTime + startElapsedTime;
            this._progress = clamp(elapsedTime / this.duration, 0, 1);
            this.render();
            if (this._progress === 1) {
                this._isEntering = false;
                this.dispatchEvent({ type: 'transitionEnd' });
            }
            requestAnimationFrame(tick);
        };
        tick();
    }
    leave() {
        if (this._isLeaving)
            return;
        if (this._progress === 0)
            return;
        this._isLeaving = true;
        this._isEntering = false;
        const startTime = performance.now();
        const startElapsedTime = this.duration * (1 - this._progress);
        const tick = () => {
            if (this._destroyed)
                return;
            if (!this._isLeaving)
                return;
            const elapsedTime = performance.now() - startTime + startElapsedTime;
            this._progress = clamp(1 - elapsedTime / this.duration, 0, 1);
            this.render();
            if (this._progress === 0) {
                this._isLeaving = false;
                this.dispatchEvent({ type: 'transitionEnd' });
            }
            requestAnimationFrame(tick);
        };
        tick();
    }
    stop() {
        if (!this._isEntering && !this._isLeaving)
            return;
        this._isEntering = false;
        this._isLeaving = false;
        this.dispatchEvent({ type: 'transitionEnd' });
    }
    reset() {
        this.stop();
        this._progress = 0;
        this.render();
    }
    setSize(w, h) {
        if (this._canvas.width === w && this._canvas.height === h)
            return;
        this._canvas.width = w;
        this._canvas.height = h;
        this._gl.viewport(0, 0, w, h);
        this._updateAspect();
    }
    setFromImage(sourceFrom) {
        this._textureFrom.setImage(sourceFrom);
    }
    setToImage(sourceTo) {
        this._textureTo.setImage(sourceTo);
    }
    render() {
        if (this._destroyed)
            return;
        this._gl.clearColor(0, 0, 0, 0);
        this._gl.uniform1f(this._uniformLocations.progress, easeInOutSine(this._progress));
        this._gl.clear(this._gl.COLOR_BUFFER_BIT | this._gl.DEPTH_BUFFER_BIT);
        this._gl.drawArrays(this._gl.TRIANGLES, 0, 6);
        this._gl.flush();
        if (this._progress === 1)
            this._hasUpdated = false;
    }
    destroy(removeElement = false) {
        this._destroyed = true;
        this._isEntering = false;
        this._isLeaving = false;
        if (removeElement)
            this.setSize(1, 1);
        if (this._program) {
            this._gl.activeTexture(this._gl.TEXTURE0);
            this._gl.bindTexture(this._gl.TEXTURE_2D, null);
            this._gl.activeTexture(this._gl.TEXTURE1);
            this._gl.bindTexture(this._gl.TEXTURE_2D, null);
            this._gl.activeTexture(this._gl.TEXTURE2);
            this._gl.bindTexture(this._gl.TEXTURE_2D, null);
            this._gl.bindBuffer(this._gl.ARRAY_BUFFER, null);
            this._gl.deleteTexture(this._textureFrom.texture);
            this._gl.deleteTexture(this._textureTo.texture);
            this._gl.deleteTexture(this._textureDisplacement.texture);
            this._gl.deleteBuffer(this._vertexBuffer);
            this._gl.deleteBuffer(this._uvBuffer);
            this._gl.deleteShader(this._vertexShader);
            this._gl.deleteShader(this._fragmentShader);
            this._gl.deleteProgram(this._program);
        }
        if (removeElement && !!this._canvas.parentNode) {
            this._canvas.parentNode.removeChild(this._canvas);
        }
    }
    _updateTexture() {
        this._gl.activeTexture(this._gl.TEXTURE0);
        this._gl.bindTexture(this._gl.TEXTURE_2D, this._textureFrom.texture);
        this._gl.uniform1i(this._uniformLocations.textureFrom, 0);
        this._gl.activeTexture(this._gl.TEXTURE1);
        this._gl.bindTexture(this._gl.TEXTURE_2D, this._textureTo.texture);
        this._gl.uniform1i(this._uniformLocations.textureTo, 1);
        this._gl.activeTexture(this._gl.TEXTURE2);
        this._gl.bindTexture(this._gl.TEXTURE_2D, this._textureDisplacement.texture);
        this._gl.uniform1i(this._uniformLocations.textureDisplacement, 2);
        this._gl.uniform1f(this._uniformLocations.disableFromImage, this._textureFrom.image ? 0 : 1);
        this._gl.uniform1f(this._uniformLocations.disableToImage, this._textureTo.image ? 0 : 1);
        this._updateAspect();
    }
    _updateAspect() {
        const canvasAspect = this._canvas.width / this._canvas.height;
        const image = this._textureFrom.image ? this._textureFrom.image : this._textureTo.image;
        const mediaAspect = image instanceof HTMLImageElement ? image.naturalWidth / image.naturalHeight :
            image instanceof HTMLCanvasElement ? image.width / image.height :
                1;
        const aspect = mediaAspect / canvasAspect;
        if (aspect < 1.0) {
            this._gl.uniform2f(this._uniformLocations.uvScale, 1, aspect);
        }
        else {
            this._gl.uniform2f(this._uniformLocations.uvScale, 1 / aspect, 1);
        }
        this._onUpdate();
    }
    _onUpdate() {
        if (this._isEntering || this._isLeaving)
            return;
        if (this._hasUpdated)
            return;
        this._hasUpdated = true;
        requestAnimationFrame(() => {
            this.render();
            this._hasUpdated = false;
        });
    }
}
function clamp(num, min, max) {
    return Math.min(Math.max(num, min), max);
}
function easeInOutSine(x) {
    return -(Math.cos(Math.PI * x) - 1) / 2;
}

export { ImageTransition as default };
