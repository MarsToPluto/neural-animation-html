/**
 * Creates a visually engaging animation inspired by the logical flow of signals
 * in a neural network. Focuses on directional propagation and activation thresholds.
 */
function createNeuralNetworkAnimation(canvasTarget, options = {}) {
    const canvas = typeof canvasTarget === 'string' ? document.getElementById(canvasTarget) : canvasTarget;
    if (!canvas) {
        console.error("Canvas target not found:", canvasTarget);
        return;
    }
    const ctx = canvas.getContext('2d');

    // --- Default Configuration - Logically Inspired Flow ---
    const config = {
        // Structure & Layout
        layers: [5, 9, 11, 9, 6],     // Example structure
        hSpacingMultiplier: 0.85,
        vSpacingMultiplier: 0.85,
        positionJitter: 10,          // Subtle jitter

        // Nodes
        baseNodeRadius: 3.0,
        nodeRadiusVariance: 0.5,
        nodeColor: 'rgba(80, 130, 200, 0.3)',   // Dim blue base
        activeNodeColor: 'rgba(220, 245, 255, 1)', // Bright white/light blue active
        nodePulseMagnitude: 1.0,      // Subtle pulse on activation
        nodePulseSpeed: 0.05,

        // Connections
        connectionColor: 'rgba(80, 130, 200, 0.1)', // Very dim base
        // Palette for connections based on *source node* activation level
        activeConnectionColors: [                // Colors used during activation ramp-up
            'rgba(100, 180, 255, 0.7)', // Mid-activation blue
            'rgba(160, 220, 255, 0.85)', // Brighter blue
            'rgba(220, 250, 255, 0.95)', // Near white/cyan peak
            'rgba(255, 255, 255, 0.9)',   // White peak
        ],
        connectionWidth: 0.5,
        activeConnectionWidth: 1.5,    // Max width at peak activation
        connectionGlowBlur: 4,         // Subtle glow
        connectionGlowColor: 'rgba(150, 220, 255, 0.2)', // Matching soft glow

        // --- Logical Simulation Parameters ---
        inputActivationProbability: 0.02, // Chance per frame an INPUT node activates
        signalPropagationSpeed: 1.0,    // Multiplier for signal strength passed forward
        activationThreshold: 0.6,       // Min combined input signal to trigger activation
        activationBoost: 1.5,           // How much activation level jumps when threshold is met
        decayRate: 0.04,                // How quickly activation level fades (lower = slower)
        minActivationLevel: 0.01,       // Level below which node is considered inactive

        // Timing & Detail
        maxConnectionsPerNode: 5,      // Controls visual density
        useCurves: false,             // Straight lines often look cleaner
        ...options // User options override defaults
    };

    let nodes = [];
    let animationFrameId = null;
    let nodeMap = new Map(); // For quick node lookup by ID
    let nextNodeId = 0;

    // --- Helper Functions ---
    function randomFloat(min, max) { return Math.random() * (max - min) + min; }
    function parseColor(colorString) {
        try {
            const match = colorString.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\)/);
            if (match) { return { r: parseInt(match[1]), g: parseInt(match[2]), b: parseInt(match[3]), a: match[4] !== undefined ? parseFloat(match[4]) : 1 }; }
        } catch (e) { /* Ignore */ }
        console.warn("Could not parse color, using default:", colorString); return { r: 50, g: 50, b: 50, a: 0.1 };
    }
    function lerp(start, end, amount) { return start + (end - start) * Math.max(0, Math.min(1, amount)); }
    function lerpColor(colorAObj, colorBObj, amount) {
        const t = Math.max(0, Math.min(1, amount));
        const r = Math.max(0, Math.min(255, Math.round(lerp(colorAObj.r, colorBObj.r, t))));
        const g = Math.max(0, Math.min(255, Math.round(lerp(colorAObj.g, colorBObj.g, t))));
        const b = Math.max(0, Math.min(255, Math.round(lerp(colorAObj.b, colorBObj.b, t))));
        const a = lerp(colorAObj.a, colorBObj.a, t);
        return { r, g, b, a };
    }
    function rgbaToString(colorObj) {
        const alpha = Math.max(0, Math.min(1, colorObj.a)); return `rgba(${colorObj.r}, ${colorObj.g}, ${colorObj.b}, ${alpha.toFixed(3)})`;
    }

    // --- Pre-process colors ---
    let parsedNodeColor, parsedActiveNodeColor, parsedConnectionColor;
    let parsedActiveConnectionColors = [];

    function processColors() {
        parsedNodeColor = parseColor(config.nodeColor);
        parsedActiveNodeColor = parseColor(config.activeNodeColor);
        parsedConnectionColor = parseColor(config.connectionColor);
        parsedActiveConnectionColors = config.activeConnectionColors.map(parseColor);
        if (parsedActiveConnectionColors.length === 0) {
            console.error("activeConnectionColors palette is empty! Using fallback.");
            parsedActiveConnectionColors.push(parseColor('rgba(255,255,255,0.9)'));
        }
    }

    // --- Setup Function ---
    function setup() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        processColors();
        nodes = [];
        nodeMap.clear();
        nextNodeId = 0;

        const layerCount = config.layers.length;
        const totalWidth = canvas.width * config.hSpacingMultiplier;
        const startX = (canvas.width - totalWidth) / 2;
        const layerSpacing = layerCount > 1 ? totalWidth / (layerCount - 1) : 0;

        let previousLayerNodeIds = [];

        config.layers.forEach((nodeCount, layerIndex) => {
            const layerX = startX + layerIndex * layerSpacing;
            const totalHeight = canvas.height * config.vSpacingMultiplier;
            const startY = (canvas.height - totalHeight) / 2;
            const nodeSpacing = nodeCount > 1 ? totalHeight / (nodeCount - 1) : totalHeight / 2;
            let currentLayerNodeIds = [];

            for (let i = 0; i < nodeCount; i++) {
                const id = nextNodeId++;
                const baseY = nodeCount === 1 ? startY + totalHeight / 2 : startY + i * nodeSpacing;
                const nodeRadius = config.baseNodeRadius + (Math.random() - 0.5) * 2 * config.nodeRadiusVariance;
                const node = {
                    id: id,
                    x: layerX + (Math.random() - 0.5) * config.positionJitter,
                    y: baseY + (Math.random() - 0.5) * config.positionJitter,
                    baseRadius: Math.max(1, nodeRadius),
                    currentRadius: Math.max(1, nodeRadius),
                    layerIndex: layerIndex,
                    activationLevel: 0, // Current activation (0 to potentially > 1, capped visually)
                    incomingSignal: 0,  // Signal accumulated this frame
                    connections: [],    // Array of { targetId: id }
                };
                nodes.push(node);
                nodeMap.set(id, node);
                currentLayerNodeIds.push(id);
            }

            // Create connections from previous layer to current layer
            if (layerIndex > 0) {
                previousLayerNodeIds.forEach(sourceId => {
                    const sourceNode = nodeMap.get(sourceId);
                    // Create a limited number of random connections forward
                    const shuffledTargets = [...currentLayerNodeIds].sort(() => 0.5 - Math.random());
                    const connectionsToMake = Math.min(config.maxConnectionsPerNode, shuffledTargets.length);
                    for (let k = 0; k < connectionsToMake; k++) {
                        sourceNode.connections.push({ targetId: shuffledTargets[k] });
                    }
                });
            }
            previousLayerNodeIds = currentLayerNodeIds; // Move to next layer
        });
    }

    // --- Update Function (Logical Flow) ---
    function update() {
        const {
            inputActivationProbability, signalPropagationSpeed,
            activationThreshold, activationBoost, decayRate, minActivationLevel
        } = config;

        // 1. Reset incoming signals for all nodes
        nodes.forEach(node => { node.incomingSignal = 0; });

        // 2. Propagate signals forward
        nodes.forEach(sourceNode => {
            // Only propagate if the source node is significantly active
            if (sourceNode.activationLevel > minActivationLevel) {
                const signalStrength = sourceNode.activationLevel * signalPropagationSpeed;
                sourceNode.connections.forEach(conn => {
                    const targetNode = nodeMap.get(conn.targetId);
                    if (targetNode) {
                        // Accumulate signal at the target node
                        targetNode.incomingSignal += signalStrength;
                    }
                });
            }
        });

        // 3. Update node activation levels based on received signal and decay
        nodes.forEach(node => {
            let currentActivation = node.activationLevel;

            // Apply decay first
            if (currentActivation > minActivationLevel) {
                currentActivation -= decayRate;
            }

            // Check for activation trigger (input nodes have separate trigger)
            if (node.layerIndex === 0) {
                // Input Layer: Randomly activate
                if (Math.random() < inputActivationProbability) {
                    // Boost activation significantly if triggered
                     currentActivation = Math.max(currentActivation, 0.1) + activationBoost; // Add boost
                }
            } else {
                 // Hidden/Output Layers: Activate based on incoming signal
                if (node.incomingSignal >= activationThreshold) {
                    // Boost activation when threshold is met
                    // Add boost relative to threshold excess? Or fixed boost? Fixed is simpler.
                     currentActivation = Math.max(currentActivation, 0.1) + activationBoost * (node.incomingSignal / activationThreshold);
                     // Optional: Reset incomingSignal after processing to prevent continuous trigger?
                     // node.incomingSignal = 0; // Uncomment if needed
                }
            }

            // Ensure activation doesn't go below minimum (or zero)
            node.activationLevel = Math.max(0, currentActivation);

            // Update node radius for pulse effect
            const pulse = config.nodePulseMagnitude > 0 ? Math.sin(Date.now() * 0.01 * config.nodePulseSpeed + node.layerIndex) * config.nodePulseMagnitude * Math.min(1, node.activationLevel) : 0;
            node.currentRadius = node.baseRadius + pulse;
        });
    }


    // --- Draw Function ---
    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const {
            connectionWidth, activeConnectionWidth, connectionGlowBlur,
            connectionGlowColor, useCurves, minActivationLevel
        } = config;

        // --- 1. Draw Connections ---
        nodes.forEach(sourceNode => {
            const activation = Math.min(1.0, sourceNode.activationLevel); // Clamp visual intensity at 1.0

            // Optimization: Skip drawing if source node is barely active
            if (activation < minActivationLevel) {
                return;
            }

            // Determine color based on activation level (interpolate through palette)
            const colorIndex = Math.floor(activation * (parsedActiveConnectionColors.length - 1));
            const nextColorIndex = Math.min(parsedActiveConnectionColors.length - 1, colorIndex + 1);
            const lerpAmount = (activation * (parsedActiveConnectionColors.length - 1)) - colorIndex;

            const startColor = parsedActiveConnectionColors[colorIndex];
            const endColor = parsedActiveConnectionColors[nextColorIndex];
            let currentConnColorObj = lerpColor(startColor, endColor, lerpAmount);

            // If activation is very low, lerp from base connection color instead
            if (activation < 0.1) { // Threshold for using base color lerp
                 const baseColorLerpAmount = activation / 0.1;
                 currentConnColorObj = lerpColor(parsedConnectionColor, currentConnColorObj, baseColorLerpAmount);
             }


            const currentWidth = lerp(connectionWidth, activeConnectionWidth, activation);
            const currentGlow = lerp(0, connectionGlowBlur, activation);
            const finalColorString = rgbaToString(currentConnColorObj);

            // Skip if visually insignificant
            if (currentWidth < 0.1 || currentConnColorObj.a < 0.01) {
                 return;
            }

            // --- Set context for this node's connections ---
            ctx.lineWidth = currentWidth;
            ctx.strokeStyle = finalColorString;
            ctx.shadowBlur = currentGlow;
            ctx.shadowColor = connectionGlowColor; // Use single configured glow color

            sourceNode.connections.forEach(conn => {
                const targetNode = nodeMap.get(conn.targetId);
                if (!targetNode) return;

                ctx.beginPath();
                ctx.moveTo(sourceNode.x, sourceNode.y);
                if (useCurves) {
                    const cpX = (sourceNode.x + targetNode.x) / 2 + (Math.random() - 0.5) * 30 * activation;
                    const cpY = (sourceNode.y + targetNode.y) / 2 + (Math.random() - 0.5) * 30 * activation;
                    ctx.quadraticCurveTo(cpX, cpY, targetNode.x, targetNode.y);
                } else {
                    ctx.lineTo(targetNode.x, targetNode.y);
                }
                ctx.stroke();
            });
        });

        // Reset shadow/glow after drawing all connections
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';


        // --- 2. Draw Nodes ---
        nodes.forEach(node => {
            const activation = Math.min(1.0, node.activationLevel); // Clamp visual intensity

            // Skip if node is visually insignificant
             if (activation < minActivationLevel && node.activationLevel === 0) return; // Stricter check for nodes

            const currentNodeColorObj = lerpColor(parsedNodeColor, parsedActiveNodeColor, activation);
            const nodeColorString = rgbaToString(currentNodeColorObj);

            if (currentNodeColorObj.a < 0.01 || node.currentRadius < 0.5) return;

            ctx.beginPath();
            ctx.arc(node.x, node.y, node.currentRadius, 0, Math.PI * 2);
            ctx.fillStyle = nodeColorString;
            ctx.fill();
        });
    }

    // --- Animation Loop, Resize, Controls ---
    function animate() {
        update();
        draw();
        animationFrameId = requestAnimationFrame(animate);
    }
    function handleResize() { stop(); setup(); start(); }
    function start() {
        if (!animationFrameId) {
            if (nodes.length === 0) setup();
            animationFrameId = requestAnimationFrame(animate);
            window.addEventListener('resize', handleResize);
        }
    }
    function stop() {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId); animationFrameId = null;
            window.removeEventListener('resize', handleResize);
        }
    }

    // --- Initial Start ---
    setup(); start();

    // --- Return control object ---
    return {
        start, stop,
        setConfig: (newOptions) => { Object.assign(config, newOptions); if (animationFrameId) { handleResize(); } else { setup(); } },
        getCurrentConfig: () => ({...config})
    };
}


// --- Initialize On Page Load ---
window.onload = () => {
    const animationControl = createNeuralNetworkAnimation('neuralCanvas', {

        // --- Palette: Cool Blues (Default) ---
        nodeColor: 'rgba(80, 130, 200, 0.3)',
        activeNodeColor: 'rgba(220, 245, 255, 1)',
        connectionColor: 'rgba(80, 130, 200, 0.1)',
        activeConnectionColors: [ // Gradient from dim blue to white/cyan
            'rgba(100, 180, 255, 0.6)',
            'rgba(160, 220, 255, 0.8)',
            'rgba(220, 250, 255, 0.95)',
            'rgba(255, 255, 255, 0.9)',
        ],
        connectionGlowColor: 'rgba(150, 220, 255, 0.2)',


        /* // --- Palette: Warm Oranges ---
        nodeColor: 'rgba(180, 120, 50, 0.3)',
        activeNodeColor: 'rgba(255, 230, 200, 1)',
        connectionColor: 'rgba(180, 120, 50, 0.1)',
        activeConnectionColors: [ // Gradient from dim orange to bright yellow/white
            'rgba(255, 160, 80, 0.6)',
            'rgba(255, 200, 100, 0.8)',
            'rgba(255, 240, 150, 0.95)',
            'rgba(255, 255, 220, 0.9)',
        ],
        connectionGlowColor: 'rgba(255, 200, 100, 0.2)',
        */

        /* // --- Palette: Greens/Teals ---
        nodeColor: 'rgba(0, 150, 100, 0.3)',
        activeNodeColor: 'rgba(200, 255, 220, 1)',
        connectionColor: 'rgba(0, 150, 100, 0.1)',
        activeConnectionColors: [ // Gradient from dim green to bright mint/white
            'rgba(50, 200, 150, 0.6)',
            'rgba(100, 255, 180, 0.8)',
            'rgba(180, 255, 220, 0.95)',
            'rgba(230, 255, 240, 0.9)',
        ],
        connectionGlowColor: 'rgba(100, 255, 180, 0.2)',
        */


        // --- Logical Behavior Tuning ---
        inputActivationProbability: 0.025, // How often new signals start (lower = sparser)
        activationThreshold: 0.55,      // Sensitivity of nodes (lower = easier to activate)
        activationBoost: 1.6,          // How much "stronger" a node gets when activated
        decayRate: 0.04,               // How quickly signals fade (lower = longer lasting signals)
        signalPropagationSpeed: 1.0,   // How much strength is passed forward

    });

    // Example: Make nodes more sensitive after 15 seconds
    // setTimeout(() => {
    //    console.log("Increasing sensitivity...");
    //    animationControl.setConfig({ activationThreshold: 0.4 });
    // }, 15000);
};