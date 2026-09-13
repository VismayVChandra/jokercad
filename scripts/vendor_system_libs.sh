#!/usr/bin/env bash
# Vercel build step. OpenCascade (via build123d) links against libGL and a
# few X11 libraries that the Vercel function runtime doesn't have. Install them
# in the build container (Amazon Linux 2023, the same base as the runtime) and
# copy them, plus their dependencies, into backend/syslibs, which ships with
# the function. The CAD subprocess finds them through LD_LIBRARY_PATH.
set -uo pipefail

dest="backend/syslibs"
mkdir -p "$dest"

for pkg in mesa-libGL libX11 libXext libXrender libSM libICE glib2 expat; do
  dnf install -y -q "$pkg" >/dev/null 2>&1 || echo "vendor_system_libs: could not install $pkg"
done

ldconfig_bin=$(command -v ldconfig || echo /sbin/ldconfig)

# The system libraries manylinux wheels (like OpenCascade's) may link against
# without bundling them.
for soname in libGL.so.1 libX11.so.6 libXext.so.6 libXrender.so.1 libSM.so.6 libICE.so.6 \
              libglib-2.0.so.0 libgobject-2.0.so.0 libgthread-2.0.so.0 libexpat.so.1; do
  path=$("$ldconfig_bin" -p | awk -v l="$soname" '$1 == l { print $NF; exit }')
  if [ -z "$path" ]; then
    echo "vendor_system_libs: $soname not found"
    continue
  fi
  for lib in "$path" $(ldd "$path" | awk '$2 == "=>" && $3 ~ /^\// { print $3 }'); do
    name=$(basename "$lib")
    case "$name" in
      # glibc itself has to come from the runtime
      libc.so*|libm.so*|libdl.so*|libpthread.so*|librt.so*|ld-linux*|libresolv.so*) continue ;;
    esac
    [ -e "$dest/$name" ] || cp -L "$lib" "$dest/$name"
  done
done

echo "vendor_system_libs: copied $(ls "$dest" | wc -l) libraries into $dest: $(ls "$dest" | tr '\n' ' ')"
[ -e "$dest/libGL.so.1" ] || { echo "vendor_system_libs: libGL.so.1 is missing, failing the build"; exit 1; }
