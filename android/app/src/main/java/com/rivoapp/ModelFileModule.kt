package com.rivoapp

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream

class ModelFileModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "RivoModelFile"

  override fun getConstants(): MutableMap<String, Any> {
    val constants = hashMapOf<String, Any>(
      "modelDirectory" to getModelDirectory().absolutePath
    )

    getLegacyExternalModelDirectory()?.let {
      constants["legacyExternalModelDirectory"] = it.absolutePath
    }

    return constants
  }

  private fun getModelDirectory(): File =
    reactContext.filesDir

  private fun getLegacyExternalModelDirectory(): File? =
    reactContext.getExternalFilesDir(null)

  private fun hasGgufMagic(file: File): Boolean {
    if (!file.exists() || !file.isFile || file.length() < 4L) {
      return false
    }

    val buffer = ByteArray(4)
    FileInputStream(file).use { stream ->
      if (stream.read(buffer) != buffer.size) {
        return false
      }
    }

    return buffer[0] == 'G'.code.toByte() &&
      buffer[1] == 'G'.code.toByte() &&
      buffer[2] == 'U'.code.toByte() &&
      buffer[3] == 'F'.code.toByte()
  }

  @ReactMethod
  fun getFileInfo(path: String, promise: Promise) {
    try {
      val file = File(path)
      val exists = file.exists() && file.isFile
      val info = Arguments.createMap()
      info.putBoolean("exists", exists)
      info.putBoolean("readable", exists && file.canRead())
      info.putBoolean("isGguf", exists && file.canRead() && hasGgufMagic(file))
      info.putDouble("size", if (exists) file.length().toDouble() else 0.0)
      promise.resolve(info)
    } catch (error: Exception) {
      promise.reject("MODEL_FILE_INFO_FAILED", error)
    }
  }

  @ReactMethod
  fun copyFile(sourcePath: String, destinationPath: String, promise: Promise) {
    try {
      val source = File(sourcePath)
      val destination = File(destinationPath)

      if (!source.exists() || !source.isFile) {
        promise.reject("MODEL_FILE_COPY_SOURCE_MISSING", "Source model file does not exist")
        return
      }

      if (source.absolutePath == destination.absolutePath) {
        promise.resolve(true)
        return
      }

      if (
        destination.exists() &&
        destination.isFile &&
        destination.length() == source.length() &&
        hasGgufMagic(destination)
      ) {
        promise.resolve(true)
        return
      }

      val parent = destination.parentFile
      parent?.mkdirs()
      val tempDestination = if (parent != null) {
        File(parent, "${destination.name}.tmp")
      } else {
        File("${destination.absolutePath}.tmp")
      }
      source.copyTo(tempDestination, overwrite = true, bufferSize = 8 * 1024 * 1024)

      if (destination.exists() && !destination.delete()) {
        tempDestination.delete()
        promise.reject("MODEL_FILE_COPY_REPLACE_FAILED", "Could not replace existing model file")
        return
      }

      if (!tempDestination.renameTo(destination)) {
        tempDestination.delete()
        promise.reject("MODEL_FILE_COPY_RENAME_FAILED", "Could not finalize copied model file")
        return
      }

      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("MODEL_FILE_COPY_FAILED", error)
    }
  }

  /**
   * Android's system photo picker commonly returns a content:// URI. The
   * native llama.cpp runtime only accepts a real filesystem path, so copy the
   * selected image into the app cache before vision inference.
   */
  @ReactMethod
  fun copyContentUriToCache(uri: String, fileName: String, promise: Promise) {
    try {
      val safeName = fileName.replace(Regex("[^A-Za-z0-9._-]"), "_")
      val cacheDirectory = File(reactContext.cacheDir, "vision-inputs")
      if (!cacheDirectory.exists() && !cacheDirectory.mkdirs()) {
        promise.reject("VISION_IMAGE_CACHE_DIRECTORY_FAILED", "Could not create vision image cache directory")
        return
      }

      val destination = File(cacheDirectory, "${System.currentTimeMillis()}_$safeName")
      val source = reactContext.contentResolver.openInputStream(android.net.Uri.parse(uri))
      if (source == null) {
        promise.reject("VISION_IMAGE_READ_FAILED", "Could not read selected image")
        return
      }

      source.use { input ->
        FileOutputStream(destination).use { output ->
          input.copyTo(output, bufferSize = 256 * 1024)
        }
      }

      if (!destination.exists() || destination.length() == 0L) {
        destination.delete()
        promise.reject("VISION_IMAGE_COPY_FAILED", "Selected image was empty")
        return
      }

      promise.resolve(destination.absolutePath)
    } catch (error: Exception) {
      promise.reject("VISION_IMAGE_COPY_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun deleteFile(path: String, promise: Promise) {
    try {
      val file = File(path)
      if (file.exists()) {
        val deleted = file.delete()
        promise.resolve(deleted)
      } else {
        promise.resolve(true)
      }
    } catch (error: Exception) {
      promise.reject("MODEL_FILE_DELETE_FAILED", error.message, error)
    }
  }
}
