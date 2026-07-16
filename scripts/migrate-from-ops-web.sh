#!/usr/bin/env bash
set -euo pipefail
SRC=/Users/leon/projects/weilan/ops-web/src/modules/knowledge/chat/generated-file
SHARED=/Users/leon/projects/weilan/ops-web/src/shared
OPS=/Users/leon/projects/weilan/ops-web

mkdir -p src/ir src/lib src/platform scripts

cp -R "$SRC/pptx-svg"       src/svg
cp -R "$SRC/pptx-themes"    src/themes
cp -R "$SRC/pptx-renderer"  src/pptx
cp "$SRC/pptx-generate.ts"                          src/pptx/generate.ts
cp "$SRC/pptx-generate.test.ts"                     src/pptx/generate.test.ts
cp "$SRC/pptx-generate-animations.test.ts"          src/pptx/generate-animations.test.ts
cp "$SRC/pptx-generate-gradient-export.test.ts"     src/pptx/generate-gradient-export.test.ts
cp "$SRC/pptx-generate-gradient-fallback.test.ts"   src/pptx/generate-gradient-fallback.test.ts
cp "$SRC/pptx-generate-ir-master.test.ts"           src/pptx/generate-ir-master.test.ts
cp "$SRC/pptx-all-themes.test.ts"                   src/pptx/all-themes.test.ts
cp "$SRC/pptx-inline-assets.ts"       src/platform/inline-assets.ts
cp "$SRC/pptx-inline-assets.test.ts"  src/platform/inline-assets.test.ts
cp "$SRC/canvas-constants.ts"       src/constants.ts
cp "$SRC/canvas-constants.test.ts"  src/constants.test.ts
cp "$SRC/pptx-preview/svg-text-layout.ts"       src/lib/
cp "$SRC/pptx-preview/svg-text-layout.test.ts"  src/lib/
cp "$SRC/pptx-preview/derive.ts"       src/lib/
cp "$SRC/pptx-preview/derive.test.ts"  src/lib/
cp "$SRC/pptx-preview/conf-labels.ts"  src/lib/
cp "$SHARED/schemas/pptx-ir.ts"       src/ir/index.ts
cp "$SHARED/schemas/pptx-ir.test.ts"  src/ir/index.test.ts
cp "$SHARED/constants/pptx-icons.ts"  src/icons.ts
cp "$OPS/scripts/gen-pptx-icons.mts"  scripts/gen-pptx-icons.mts

# scratch 测试不迁（依赖 ops-web 本地 scratchpad 素材）
rm -f src/svg/layout-matrix.scratch.test.tsx src/svg/tech-audit.scratch.test.tsx

# specifier 机械重写：只动 ts/tsx，.snap 不碰。顺序重要（长串先替）
find src -type f \( -name "*.ts" -o -name "*.tsx" \) -print0 | xargs -0 perl -pi -e '
  s{\@/shared/schemas/pptx-ir}{\@/ir}g;
  s{\@/shared/constants/pptx-icons}{\@/icons}g;
  s{pptx-preview/}{lib/}g;
  s{canvas-constants}{constants}g;
  s{pptx-themes}{themes}g;
  s{pptx-renderer}{pptx}g;
  s{pptx-svg}{svg}g;
  s{\./pptx-generate}{./generate}g;
  s{\./pptx-inline-assets}{./inline-assets}g;
  s{\./pptx-ir}{./index}g;
  s{GeneratedFileError}{PptfastError}g;
'

# 图标生成脚本的输出路径指向新位置
perl -pi -e 's{src/shared/constants/pptx-icons\.ts}{src/icons.ts}g' scripts/gen-pptx-icons.mts

echo "migrate done"
