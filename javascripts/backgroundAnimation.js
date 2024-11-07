// Set up scene, camera, and renderer
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
const initialWidth = visualViewport.width;
const initialHeight = visualViewport.height;
renderer.setSize(window.innerWidth, visualViewport.height); // Set initial size
renderer.domElement.style.position = 'fixed'; // Position the canvas fixed behind everything
renderer.domElement.style.top = '0';
renderer.domElement.style.left = '0';
renderer.domElement.style.zIndex = '-1'; // Ensure it's in the background
document.body.appendChild(renderer.domElement);

// Resize renderer on window resize and scroll
function updateRendererSize() {
    let updateheight = visualViewport.height;

    if (updateheight > initialHeight) {
        renderer.setSize(window.innerWidth, updateheight);
        camera.aspect = window.innerWidth / updateheight;
        camera.updateProjectionMatrix();
    }
    else {
        renderer.setSize(window.innerWidth, initialHeight);
        camera.aspect = window.innerWidth / initialHeight;
        camera.updateProjectionMatrix();
    }
}

window.addEventListener('resize', updateRendererSize);

// Add a group of stars to the scene
const starGeometry = new THREE.BufferGeometry();
const starMaterial = new THREE.PointsMaterial({ color: 0xffffff });

// Create stars with random positions
const starVertices = [];
for (let i = 0; i < 10000; i++) {
    const x = THREE.MathUtils.randFloatSpread(2000);
    const y = THREE.MathUtils.randFloatSpread(2000);
    const z = THREE.MathUtils.randFloatSpread(2000);
    starVertices.push(x, y, z);
}
starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));

const stars = new THREE.Points(starGeometry, starMaterial);
scene.add(stars);

// Set the initial camera position
const zInterval = 0.1;
camera.position.z = 1;
const numberOfSteps = Math.round(900 / zInterval); 
var counter = 0;
var forward = true;

// Animation function to simulate moving through space
function animate() {
    requestAnimationFrame(animate);

    if (counter < numberOfSteps) { 
        if (forward) {
            camera.position.z -= zInterval;
        } else {
            camera.position.z += zInterval;
        }
        counter += 1;
    } else {
        counter = 0;
        if (forward) {
            forward = false;
        } else {
            forward = true;
        }
    }

    // Rotate stars for effect
    // stars.rotation.x += 0.0005;
    // stars.rotation.y += 0.0005;

    renderer.render(scene, camera);
}

animate();
