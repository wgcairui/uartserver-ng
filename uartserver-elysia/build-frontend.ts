/**
 * Frontend Build Script
 *
 * 构建 Eden Treaty 前端示例
 */

const result = await Bun.build({
  entrypoints: ['./public/src/demo.ts'],
  outdir: './public/dist',
  target: 'browser',
  format: 'esm',
  minify: false,
  sourcemap: 'external',
  splitting: true,
});

if (!result.success) {
  console.error('❌ Build failed:');
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

console.log('✅ Frontend build successful!');
console.log(`📦 Generated ${result.outputs.length} files:`);
for (const output of result.outputs) {
  console.log(`  - ${output.path}`);
}
