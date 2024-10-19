import pkg from './package.json' assert { type: 'json' };
import rollupTypescript from '@rollup/plugin-typescript';
import typescript from 'typescript';

const license = `/*!
 * @author yomotsu
 * image-transition
 * https://github.com/yomotsu/image-transition
 * Released under the MIT License.
 */`;

export default {
	input: 'src/index.ts',
	output: [
		{
			format: 'umd',
			name: 'ImageTransition',
			file: pkg.main,
			banner: license,
			indent: '\t',
		},
		{
			format: 'es',
			file: pkg.module,
			banner: license,
			indent: '\t',
		}
	],
	plugins: [
		rollupTypescript( { typescript } ),
	],
};
