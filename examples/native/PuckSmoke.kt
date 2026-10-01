// Library ABI smoke test only. No windows, device access or mouse injection.
import com.sun.jna.IntegerType
import com.sun.jna.Library
import com.sun.jna.Memory
import com.sun.jna.Native
import com.sun.jna.Pointer
import java.nio.file.Path

class SizeT(value: Long = 0) : IntegerType(Native.SIZE_T_SIZE, value, true) {
    override fun toByte(): Byte = toLong().toByte()
    override fun toShort(): Short = toLong().toShort()
}
interface PuckAbi : Library {
    fun puck_abi_version(): Int
    fun puck_create(json: Pointer, length: SizeT): Int
    fun puck_destroy(handle: Int): Int
    fun puck_command(handle: Int, json: Pointer, length: SizeT): Int
    fun puck_feed(handle: Int, time: Double, x: Double, y: Double, z: Double, rx: Double, ry: Double, rz: Double): Int
    fun puck_response_len(handle: Int): SizeT
    fun puck_response_copy(handle: Int, output: Pointer, capacity: SizeT): SizeT
}
fun main(args: Array<String>) {
    require(args.size == 1) { "Pass the absolute path to the Puck library" }
    val path = Path.of(args[0]); require(path.isAbsolute)
    val abi = Native.load(path.toString(), PuckAbi::class.java)
    check(abi.puck_abi_version() == 1)
    fun response(handle: Int): String {
        val size = abi.puck_response_len(handle).toLong(); check(size in 1..16_777_216)
        Memory(size).use { out ->
            check(abi.puck_response_copy(handle, out, SizeT(size)).toLong() == size)
            return String(out.getByteArray(0, size.toInt()), Charsets.UTF_8)
        }
    }
    val json = """{"kind":"puck","options":{"controls":{"scroll":{"kind":"continuous","source":"twist","options":{"as":"velocity","deadzone":0,"responseMs":0}}}}}""".toByteArray()
    val handle = Memory(json.size.toLong()).use { buffer ->
        buffer.write(0, json, 0, json.size)
        abi.puck_create(buffer, SizeT(json.size.toLong()))
    }
    check(handle != 0) { response(0) }
    try {
        check(abi.puck_feed(handle, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.5) == 1)
        val request = """{"op":"read","control":"controls.scroll"}""".toByteArray()
        Memory(request.size.toLong()).use { buffer ->
            buffer.write(0, request, 0, request.size)
            check(abi.puck_command(handle, buffer, SizeT(request.size.toLong())) == 1)
        }
        val result = response(handle)
        check(result.contains("\"value\":0.5")) { result }
        println("Kotlin/JNA -> Puck ABI 1: twist velocity 0.5; passed")
    } finally { check(abi.puck_destroy(handle) == 1) }
}
