export const VERTEX_SHADER_SOURCE = /*glsl*/`
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

// based on https://github.com/robin-dela/hover-effect/blob/master/src/hover-effect.js
export const FRAGMENT_SHADER_SOURCE = /*glsl*/`
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
