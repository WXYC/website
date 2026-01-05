import { useEffect, useRef, useState } from 'react'

const vertexShaderSource = `#version 300 es
in vec2 a_position;
out vec2 v_uv;

void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`

const fragmentShaderSource = `#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_brightness;
uniform float u_noiseScale;
uniform vec3 u_noiseOffset;
uniform sampler2D u_noiseTex;

in vec2 v_uv;
out vec4 fragColor;

const float INV_GAMMA = 0.45454545;
const float SQRT3_HALF = 0.86602540378;
const float INV_1024 = 0.0009765625;  // 1.0 / 1024.0

// Hash function using texture lookup
float hash(vec3 p) {
    vec2 uv = (p.xy + p.z * 37.0) * INV_1024;
    return texture(u_noiseTex, uv).x;
}

// 3D Perlin noise with smooth interpolation
float perlinNoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = p - i;
    f = f * f * (3.0 - 2.0 * f); // smoothstep
    
    // Get hash values for 8 corners of the cube
    float n000 = hash(i + vec3(0.0, 0.0, 0.0));
    float n100 = hash(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash(i + vec3(1.0, 1.0, 1.0));
    
    // Trilinear interpolation
    float x00 = mix(n000, n100, f.x);
    float x10 = mix(n010, n110, f.x);
    float x01 = mix(n001, n101, f.x);
    float x11 = mix(n011, n111, f.x);
    
    float y0 = mix(x00, x10, f.y);
    float y1 = mix(x01, x11, f.y);
    
    return mix(y0, y1, f.z);
}

// Get two independent noise values for the two blobs
vec2 Noise(vec3 x) {
    return vec2(
        perlinNoise(x),
        perlinNoise(x + u_noiseOffset)
    );
}

void main() {
    vec2 uv = (v_uv - 0.5) * vec2(1.0, u_resolution.y / u_resolution.x);

    vec3 noiseCoord = vec3(uv.x, uv.y * SQRT3_HALF, uv.y * 0.5) * u_noiseScale;
    noiseCoord.yz += u_time * vec2(-0.1, 0.1);

    vec2 blob = Noise(noiseCoord);

    const vec3 ink1 = vec3(0.1, 0.9, 0.8);
    const vec3 ink2 = vec3(0.9, 0.1, 0.6);

    float exp1 = 4.0 * sqrt(max(0.0, (blob.x - 0.6) * 2.0));
    float exp2 = 4.0 * sqrt(max(0.0, (blob.y - 0.6) * 2.0));
    vec3 col1 = pow(ink1, vec3(exp1));
    vec3 col2 = pow(ink2, vec3(exp2));

    vec3 color = pow(1.0 - col1 * col2, vec3(INV_GAMMA));
    color *= u_brightness;

    fragColor = vec4(color, 1.0);
}
`

function compileShader(gl, type, source) {
    const shader = gl.createShader(type)
    if (!shader) return null
    
    gl.shaderSource(shader, source)
    gl.compileShader(shader)

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(shader))
        gl.deleteShader(shader)
        return null
    }
    return shader
}

function createProgram(gl, vertexShader, fragmentShader) {
    const program = gl.createProgram()
    if (!program) return null
    
    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('Program link error:', gl.getProgramInfoLog(program))
        gl.deleteProgram(program)
        return null
    }
    return program
}

// Store start time globally so it persists across component remounts
let globalStartTime = null
function getGlobalStartTime() {
    if (globalStartTime === null) {
        globalStartTime = performance.now()
    }
    return globalStartTime
}

// Store noise texture seed globally so it's consistent across page loads
let globalNoiseSeed = null
function getGlobalNoiseSeed() {
    if (globalNoiseSeed === null) {
        globalNoiseSeed = Math.random()
    }
    return globalNoiseSeed
}

// Seeded random for consistent noise texture
function seededRandom(seed) {
    const x = Math.sin(seed) * 10000
    return x - Math.floor(x)
}

function createSeededNoiseTexture(gl, size = 1024) {
    const baseSeed = getGlobalNoiseSeed()
    const data = new Uint8Array(size * size * 4)
    for (let i = 0; i < size * size; i++) {
        data[i * 4 + 0] = seededRandom(baseSeed + i * 0.001) * 255
        data[i * 4 + 1] = seededRandom(baseSeed + i * 0.001 + 1000) * 255
        data[i * 4 + 2] = seededRandom(baseSeed + i * 0.001 + 2000) * 255
        data[i * 4 + 3] = 255
    }

    const texture = gl.createTexture()
    if (!texture) return null
    
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

    return texture
}

export default function LavaLiteBackground({ 
    brightness = 1.0, 
    speed = 0.25,
    noiseScale = 4.0,
    noiseOffset = [100.0, 200.0, 300.0]
}) {
    const canvasRef = useRef(null)
    const animationRef = useRef(null)
    const lastFrameTimeRef = useRef(0)
    const [isSupported, setIsSupported] = useState(true)

    useEffect(() => {
        // Skip if we already determined WebGL isn't supported
        if (!isSupported) return
        
        const canvas = canvasRef.current
        if (!canvas) return

        let gl = null
        let program = null
        let isCleanedUp = false

        try {
            // Try to get WebGL2 context
            gl = canvas.getContext('webgl2', {
                alpha: false,
                antialias: false,
                powerPreference: 'low-power',
                failIfMajorPerformanceCaveat: true
            })

            if (!gl) {
                console.warn('WebGL2 not supported, background disabled')
                setIsSupported(false)
                return
            }

            // Compile shaders
            const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource)
            const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource)
            
            if (!vertexShader || !fragmentShader) {
                console.warn('Shader compilation failed, background disabled')
                setIsSupported(false)
                return
            }

            program = createProgram(gl, vertexShader, fragmentShader)
            if (!program) {
                console.warn('Program linking failed, background disabled')
                setIsSupported(false)
                return
            }

            // Create fullscreen quad
            const positionBuffer = gl.createBuffer()
            if (!positionBuffer) {
                setIsSupported(false)
                return
            }
            
            gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
                -1, -1,
                1, -1,
                -1, 1,
                1, 1
            ]), gl.STATIC_DRAW)

            const positionLocation = gl.getAttribLocation(program, 'a_position')
            gl.enableVertexAttribArray(positionLocation)
            gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)

            // Create noise texture with seeded randomness for consistency
            const noiseTex = createSeededNoiseTexture(gl)
            if (!noiseTex) {
                setIsSupported(false)
                return
            }

            // Get uniform locations
            const resolutionLocation = gl.getUniformLocation(program, 'u_resolution')
            const timeLocation = gl.getUniformLocation(program, 'u_time')
            const brightnessLocation = gl.getUniformLocation(program, 'u_brightness')
            const noiseScaleLocation = gl.getUniformLocation(program, 'u_noiseScale')
            const noiseOffsetLocation = gl.getUniformLocation(program, 'u_noiseOffset')
            const noiseTexLocation = gl.getUniformLocation(program, 'u_noiseTex')

            gl.useProgram(program)
            gl.activeTexture(gl.TEXTURE0)
            gl.bindTexture(gl.TEXTURE_2D, noiseTex)
            gl.uniform1i(noiseTexLocation, 0)

            const startTime = getGlobalStartTime()

            const resize = () => {
                if (isCleanedUp || !canvas) return
                // Render at half resolution for performance
                const dpr = Math.min(window.devicePixelRatio || 1, 2)
                const width = Math.floor(window.innerWidth * dpr * 1.0)
                const height = Math.floor(window.innerHeight * dpr * 1.0)
                
                canvas.width = width
                canvas.height = height
                gl.viewport(0, 0, width, height)
            }

            resize()
            window.addEventListener('resize', resize)

            const frameInterval = 1000 / 60 // 30 fps

            const render = (timestamp) => {
                if (isCleanedUp) return
                
                // Throttle to 30fps
                if (timestamp - lastFrameTimeRef.current < frameInterval) {
                    animationRef.current = requestAnimationFrame(render)
                    return
                }
                lastFrameTimeRef.current = timestamp

                const time = ((performance.now() - startTime) / 1000) * speed

                gl.uniform2f(resolutionLocation, canvas.width, canvas.height)
                gl.uniform1f(timeLocation, time)
                gl.uniform1f(brightnessLocation, brightness)
                gl.uniform1f(noiseScaleLocation, noiseScale)
                gl.uniform3f(noiseOffsetLocation, noiseOffset[0], noiseOffset[1], noiseOffset[2])

                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

                animationRef.current = requestAnimationFrame(render)
            }

            animationRef.current = requestAnimationFrame(render)

            return () => {
                isCleanedUp = true
                window.removeEventListener('resize', resize)
                if (animationRef.current) {
                    cancelAnimationFrame(animationRef.current)
                    animationRef.current = null
                }
            }
        } catch (error) {
            console.warn('WebGL initialization failed:', error)
            setIsSupported(false)
            return
        }
    }, [brightness, speed, noiseScale, noiseOffset, isSupported])

    // Render black background if WebGL isn't supported
    if (!isSupported) {
        return (
            <div
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    zIndex: -1,
                    backgroundColor: '#000000',
                    pointerEvents: 'none'
                }}
            />
        )
    }

    return (
        <canvas
            ref={canvasRef}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                zIndex: -1,
                pointerEvents: 'none'
            }}
        />
    )
}
