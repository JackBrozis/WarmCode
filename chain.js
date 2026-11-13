// Dedicated 3D chain module. The main site script remains responsible for site UI.
const $ = (selector) => document.querySelector(selector);
const viewport = $("#viewport");
const motionButton = $("#motion-toggle");
const topic = $("#topic");
const motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
let reducedMotion = motionPreference.matches;
let motionPaused = reducedMotion || motionButton?.getAttribute("aria-pressed") === "true";
let adminSelected = topic?.value === "Administrator request";

motionButton?.addEventListener("click", () => {
  motionPaused = motionButton.getAttribute("aria-pressed") === "true";
});
motionPreference.addEventListener("change", (event) => {
  reducedMotion = event.matches;
  if (reducedMotion) motionPaused = true;
  else motionPaused = motionButton?.getAttribute("aria-pressed") === "true";
});
topic?.addEventListener("change", () => {
  adminSelected = topic.value === "Administrator request";
});

// Three.js loads independently, so a WebGL/CDN failure does not break
// navigation, downloads, or the support form.
async function initializeChain() {
  try {
    const THREE = await import("three");
    const { RoomEnvironment } = await import(
      "three/addons/environments/RoomEnvironment.js"
    );

    const container = $("#scene");
    const scene = new THREE.Scene();

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance"
    });

    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.appendChild(renderer.domElement);

    // Generated studio environment: no external HDR asset required.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environmentScene = new RoomEnvironment();
    const environment = pmrem.fromScene(environmentScene, .04);

    scene.environment = environment.texture;
    environmentScene.dispose();
    pmrem.dispose();

    const viewWidth = 19;
    const camera = new THREE.PerspectiveCamera(
      40,
      innerWidth / innerHeight,
      .1,
      180
    );

    function resizeScene() {
      const aspect = innerWidth / innerHeight;
      camera.aspect = aspect;

      // Keep a stable horizontal span, including on narrow screens.
      camera.position.z =
        viewWidth / (2 * Math.tan(THREE.MathUtils.degToRad(20)) * aspect);

      camera.far = Math.max(180, camera.position.z + 100);
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.setSize(innerWidth, innerHeight);
    }

    resizeScene();
    window.addEventListener("resize", resizeScene);

    const keyLight = new THREE.DirectionalLight(0xff7029, 5);
    keyLight.position.set(-3, 8, 12);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x6b94ff, 4);
    rimLight.position.set(8, -3, 6);
    scene.add(rimLight);

    const whiteLight = new THREE.DirectionalLight(0xffffff, 2);
    whiteLight.position.set(0, 6, -4);
    scene.add(whiteLight);

    // One torus shape, 80 instances, one chain draw call.
    const geometry = new THREE.TorusGeometry(.5, .12, 12, 32);
    const material = new THREE.MeshStandardMaterial({
      color: 0xd3d6de,
      metalness: 1,
      roughness: .2,
      envMapIntensity: 1.1,
      transparent: true,
      opacity: .48
    });

    const count = 80;
    const chain = new THREE.InstancedMesh(geometry, material, count);
    chain.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    // Transforms move each frame, so avoid stale instance bounds.
    chain.frustumCulled = false;
    scene.add(chain);

    // Continuous open path across all four section centers.
    // Its endpoints are outside the main content area.
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-13, 6, -4),
      new THREE.Vector3(-5, 3, -1),
      new THREE.Vector3(4, -4, 1),
      new THREE.Vector3(12, -3, -1),
      new THREE.Vector3(20, 3, -1),
      new THREE.Vector3(28, 4, 0),
      new THREE.Vector3(36, -4, 1),
      new THREE.Vector3(44, -3, -1),
      new THREE.Vector3(52, 4, 0),
      new THREE.Vector3(62, 1, -2),
      new THREE.Vector3(67, -6, -4)
    ], false, "centripetal");

    const dummy = new THREE.Object3D();
    const up = new THREE.Vector3(0, 1, 0);
    const point = new THREE.Vector3();
    const tangent = new THREE.Vector3();
    const pointer = new THREE.Vector2();
    const currentPointer = new THREE.Vector2();

    const colors = [
      new THREE.Color("#ff7029"),
      new THREE.Color("#102958"),
      new THREE.Color("#161821"),
      new THREE.Color("#ff7029")
    ];

    const rimColors = [
      new THREE.Color("#8d9ec7"),
      new THREE.Color("#377cff"),
      new THREE.Color("#404552"),
      new THREE.Color("#c18b6e")
    ];

    const mixedColor = new THREE.Color();
    const mixedRim = new THREE.Color();

    window.addEventListener("pointermove", (event) => {
      pointer.set(
        event.clientX / innerWidth - .5,
        event.clientY / innerHeight - .5
      );
    }, { passive: true });

    let lastTime = performance.now();
    let elapsed = 0;
    let adminBlend = 0;
    let wasPaused = false;

    renderer.setAnimationLoop((now) => {
      const dt = Math.min((now - lastTime) / 1000, .05);
      lastTime = now;

      if (document.hidden) return;

      const progress = Math.max(
        0,
        Math.min(3, viewport.scrollLeft / Math.max(viewport.clientWidth, 1))
      );

      // Paused motion still permits rendering when the user scrolls.
      if (!motionPaused) elapsed += dt;

      const adminTarget = adminSelected
        ? Math.max(0, 1 - Math.abs(progress - 2))
        : 0;

      const blendSpeed = reducedMotion || motionPaused
        ? 1
        : 1 - Math.exp(-dt * 1.4);

      adminBlend += (adminTarget - adminBlend) * blendSpeed;

      const section = Math.min(2, Math.floor(progress));
      const fraction = progress - section;

      mixedColor.copy(colors[section]).lerp(colors[section + 1], fraction);
      mixedRim.copy(rimColors[section]).lerp(rimColors[section + 1], fraction);

      keyLight.color.copy(mixedColor);
      rimLight.color.copy(mixedRim);

      const center = progress * 18;
      keyLight.position.x = center - 3;
      keyLight.target.position.set(center, 0, 0);
      rimLight.position.x = center + 8;
      rimLight.target.position.set(center, 0, 0);
      whiteLight.position.x = center;
      whiteLight.target.position.set(center, 0, 0);

      keyLight.target.updateMatrixWorld();
      rimLight.target.updateMatrixWorld();
      whiteLight.target.updateMatrixWorld();

      material.opacity = THREE.MathUtils.lerp(.48, .22, adminBlend);
      material.envMapIntensity = THREE.MathUtils.lerp(1.1, .6, adminBlend);

      if (!motionPaused && !reducedMotion) {
        currentPointer.lerp(pointer, 1 - Math.exp(-dt * 2));
      } else {
        currentPointer.set(0, 0);
      }

      camera.position.x = center + currentPointer.x * .35;
      camera.position.y = currentPointer.y * -.3;
      camera.lookAt(center, 0, 0);

      // Scroll pulls the chain; a very slow idle motion keeps it alive.
      const offset = progress * .075 + elapsed * .002;
      const roll = elapsed * .18 * adminBlend;

      for (let i = 0; i < count; i++) {
        // Keep the parameter strictly inside the open curve. Using the
        // direct parameter avoids CatmullRomCurve3 arc-length cache edge cases.
        const t = THREE.MathUtils.euclideanModulo(i / count + offset, 1);
        const safeT = THREE.MathUtils.clamp(t, 0, 0.999999);

        curve.getPoint(safeT, point);
        curve.getTangent(safeT, tangent).normalize();

        dummy.position.copy(point);
        dummy.quaternion.setFromUnitVectors(up, tangent);

        // Local Y is now the path tangent.
        // Every second link rotates 90° around it.
        dummy.rotateY((i % 2) * Math.PI / 2 + roll);

        // Fade link size near the open endpoints to hide modulo wrapping.
        const edge = Math.min(
          THREE.MathUtils.smoothstep(t, 0, .018),
          1 - THREE.MathUtils.smoothstep(t, .982, 1)
        );

        const scale = Math.max(.001, edge);
        dummy.scale.set(scale, 1.6 * scale, scale);
        dummy.updateMatrix();

        chain.setMatrixAt(i, dummy.matrix);
      }

      chain.instanceMatrix.needsUpdate = true;

      // Skip static duplicate frames when paused.
      const state = [
        progress.toFixed(5),
        adminBlend.toFixed(4),
        innerWidth,
        innerHeight
      ].join(":");

      if (!motionPaused || state !== wasPaused) {
        renderer.render(scene, camera);
      }
      wasPaused = state;
    });

    renderer.domElement.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      renderer.setAnimationLoop(null);
      container.style.opacity = "0";
    });

    window.addEventListener("pagehide", (event) => {
      if (event.persisted) return;
      renderer.setAnimationLoop(null);
      geometry.dispose();
      material.dispose();
      environment.dispose();
      renderer.dispose();
    }, { once: true });

  } catch (error) {
    console.warn("3D chain unavailable; using the CSS background.", error);
    $("#scene").hidden = true;
  }
}

initializeChain();
