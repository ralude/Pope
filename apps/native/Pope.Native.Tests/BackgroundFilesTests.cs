using Pope.Bridge;
using Xunit;

namespace Pope.Native.Tests;

public sealed class BackgroundFilesTests
{
    private static readonly string Valid = new string('a', 32) + new string('0', 16) + "0123456789abcdef";

    [Fact(DisplayName = "REQ-003-73: una huella SHA-256 son 64 hexadecimales en minúscula")]
    public void AcceptsLowercaseHexOfExactLength()
    {
        Assert.True(BackgroundFiles.IsHash(Valid));
        Assert.True(BackgroundFiles.IsHash(new string('f', 64)));
        Assert.True(BackgroundFiles.IsHash(new string('0', 64)));
    }

    [Theory(DisplayName = "REQ-003-63/73: nada que no sea una huella llega a ser nombre de archivo")]
    [InlineData("")]
    [InlineData("..")]
    [InlineData("../../Windows/System32/config/SAM")]
    [InlineData("..\\..\\secreto")]
    [InlineData("%2e%2e%2f%2e%2e%2fsecreto")]
    public void RejectsTraversalAndOtherNames(string value) => Assert.False(BackgroundFiles.IsHash(value));

    [Fact(DisplayName = "REQ-003-63/73: mayúsculas, longitud incorrecta y separadores se rechazan")]
    public void RejectsUppercaseLengthAndSeparators()
    {
        Assert.False(BackgroundFiles.IsHash(Valid.ToUpperInvariant().Replace('0', 'A')));
        Assert.False(BackgroundFiles.IsHash(new string('A', 64)));
        Assert.False(BackgroundFiles.IsHash(new string('a', 63)));
        Assert.False(BackgroundFiles.IsHash(new string('a', 65)));
        // Del largo exacto, pero con un separador de ruta, una extensión o un espacio dentro.
        Assert.False(BackgroundFiles.IsHash(new string('a', 63) + "/"));
        Assert.False(BackgroundFiles.IsHash(new string('a', 63) + "\\"));
        Assert.False(BackgroundFiles.IsHash(new string('a', 60) + ".tmp"));
        Assert.False(BackgroundFiles.IsHash(new string('a', 63) + " "));
        Assert.False(BackgroundFiles.IsHash(new string('a', 63) + "g"));
        Assert.False(BackgroundFiles.IsHash(new string('a', 63) + "\0"));
        Assert.False(BackgroundFiles.IsHash(null));
    }

    [Fact(DisplayName = "REQ-003-63/73: solo dígitos ASCII; los de otros alfabetos no valen")]
    public void RejectsNonAsciiDigits()
    {
        // Dígitos arábigo-índicos (U+0660..U+0669) y de ancho completo: char.IsDigit los admite.
        Assert.False(BackgroundFiles.IsHash(new string('a', 63) + "٣"));
        Assert.False(BackgroundFiles.IsHash(new string('a', 63) + "３"));
        Assert.False(BackgroundFiles.IsHash(new string('a', 63) + "á"));
    }
}
