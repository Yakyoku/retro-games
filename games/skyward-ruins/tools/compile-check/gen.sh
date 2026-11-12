#!/bin/bash
# Unity の Editor に同梱された UnityEngine の DLL とパッケージのソースを参照して、作品の C# を dotnet でコンパイルする（ライセンス不要の検証）。
# 使い方: UNITY=/opt/unity/Editor PKG=/tmp/claude-0/pkgs WXR=<unity-webxr-export のクローン> bash gen.sh && dotnet build Runtime.csproj
set -e
NUNIT=$(find ${UNITY:-/opt/unity/Editor}/Data/Resources/PackageManager/BuiltInPackages/com.unity.ext.nunit -name nunit.framework.dll | head -1)
UNITY=${UNITY:-/opt/unity/Editor}; PKG=${PKG:-/tmp/claude-0/pkgs}; WXR=${WXR:-/tmp/claude-0/wxr}
HERE=$(cd $(dirname $0) && pwd); PROJ=$(cd $HERE/../../unity/SkywardRuins && pwd)
M=$UNITY/Data/Managed/UnityEngine
DEFS="UNITY_6000_0_OR_NEWER;UNITY_6000_0;UNITY_2023_3_OR_NEWER;UNITY_2023_2_OR_NEWER;UNITY_2023_1_OR_NEWER;UNITY_2022_3_OR_NEWER;UNITY_2022_2_OR_NEWER;UNITY_2022_1_OR_NEWER;UNITY_2021_3_OR_NEWER;UNITY_2021_2_OR_NEWER;UNITY_2021_1_OR_NEWER;UNITY_2020_3_OR_NEWER;UNITY_2020_2_OR_NEWER;UNITY_2020_1_OR_NEWER;UNITY_2019_4_OR_NEWER;UNITY_2019_3_OR_NEWER;UNITY_2019_2_OR_NEWER;UNITY_2019_1_OR_NEWER;UNITY_2018_4_OR_NEWER;UNITY_2018_3_OR_NEWER;UNITY_WEBGL;ENABLE_IL2CPP;ENABLE_INPUT_SYSTEM;CSHARP_7_3_OR_NEWER;UNITY_INPUT_SYSTEM_ENABLE_UI;UNITY_INPUT_SYSTEM_ENABLE_XR;ENABLE_VR;ENABLE_AR;UNITY_XR_MANAGEMENT_4_3_1_OR_NEWER;HAS_POSITION_AND_ROTATION;PACKAGE_UGUI_EXISTS"
refs() { for f in $M/UnityEngine.dll $M/UnityEngine.*Module.dll; do echo "    <Reference Include=\"$(basename $f .dll)\"><HintPath>$f</HintPath><Private>false</Private></Reference>"; done; }
proj() { # name, compile-includes, compile-removes, project-refs, extra-defines
cat > $HERE/$1.csproj <<XML
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>netstandard2.1</TargetFramework><LangVersion>9.0</LangVersion><AssemblyName>$6</AssemblyName>
    <EnableDefaultCompileItems>false</EnableDefaultCompileItems><Nullable>disable</Nullable><NoWarn>CS0618;CS0649;CS0414;CS0169;CS0067;CS1998;CS0162;CS0219;CS8632;CS0108;CS0114;CS0109</NoWarn>
    <AllowUnsafeBlocks>true</AllowUnsafeBlocks><DefineConstants>$DEFS;$5</DefineConstants>
    <OutputPath>bin/$1/</OutputPath><GenerateAssemblyInfo>false</GenerateAssemblyInfo>
  </PropertyGroup>
  <ItemGroup>
$2
$3
  </ItemGroup>
  <ItemGroup>
$(refs)
$4
  </ItemGroup>
</Project>
XML
}
UG=$UNITY/Data/Resources/PackageManager/BuiltInPackages/com.unity.ugui
proj UGUI "    <Compile Include=\"$UG/Runtime/UGUI/**/*.cs\" />" "    <Compile Remove=\"$UG/Runtime/UGUI/**/Editor/**\" />" "" "" UnityEngine.UI
IS=$PKG/com.unity.inputsystem-1.17.0/package/InputSystem
proj InputSystem "    <Compile Include=\"$IS/**/*.cs\" />" "    <Compile Remove=\"$IS/Plugins/InputForUI/**\" />" "    <ProjectReference Include=\"UGUI.csproj\" />" "" Unity.InputSystem
XM=$PKG/com.unity.xr.management-4.5.3/package/Runtime
WR=$WXR/Packages/webxr/Runtime
proj WebXR "    <Compile Include=\"$WR/**/*.cs\" />" "" "    <ProjectReference Include=\"XRManagement.csproj\" />" "" WebXR
proj Runtime "    <Compile Include=\"$PROJ/Assets/SkywardRuins/Core/**/*.cs\" /><Compile Include=\"$PROJ/Assets/SkywardRuins/Runtime/**/*.cs\" />" "" "    <ProjectReference Include=\"UGUI.csproj\" /><ProjectReference Include=\"InputSystem.csproj\" /><ProjectReference Include=\"WebXR.csproj\" />" "SKYWARD_WEBXR" SkywardRuins.Runtime
echo generated
# ---- エディタ側（UnityEditor の DLL と XR Management Editor のソース）
erefs() { refs; for f in $(ls $M/UnityEditor.dll $M/UnityEditor.*.dll 2>/dev/null); do echo "    <Reference Include=\"$(basename $f .dll)\"><HintPath>$f</HintPath><Private>false</Private></Reference>"; done; }
eproj() {
cat > $HERE/$1.csproj <<XML
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>netstandard2.1</TargetFramework><LangVersion>9.0</LangVersion><AssemblyName>$5</AssemblyName>
    <EnableDefaultCompileItems>false</EnableDefaultCompileItems><Nullable>disable</Nullable><NoWarn>CS0618;CS0649;CS0414;CS0169;CS0067;CS1998;CS0162;CS0219;CS8632;CS0108;CS0114;CS0109</NoWarn>
    <AllowUnsafeBlocks>true</AllowUnsafeBlocks><DefineConstants>$DEFS;UNITY_EDITOR;$4</DefineConstants>
    <OutputPath>bin/$1/</OutputPath><GenerateAssemblyInfo>false</GenerateAssemblyInfo>
  </PropertyGroup>
  <ItemGroup>
$2
  </ItemGroup>
  <ItemGroup>
$(erefs)
$3
  </ItemGroup>
</Project>
XML
}
eproj XRManagement "    <Compile Include=\"$XM/**/*.cs\" />" "" "" Unity.XR.Management
XE=$PKG/com.unity.xr.management-4.5.3/package/Editor
eproj XRManagementEditor "    <Compile Include=\"$XE/**/*.cs\" /><Compile Remove=\"$XE/XRPluginManagementProjectValidation.cs\" />" "    <ProjectReference Include=\"XRManagement.csproj\" />" "" Unity.XR.Management.Editor
eproj Editor "    <Compile Include=\"$PROJ/Assets/SkywardRuins/Editor/**/*.cs\" /><Compile Include=\"$PROJ/Assets/SkywardRuins/Tests/Editor/**/*.cs\" />" "    <ProjectReference Include=\"Runtime.csproj\" /><ProjectReference Include=\"XRManagementEditor.csproj\" /><ProjectReference Include=\"WebXR.csproj\" /><ProjectReference Include=\"InputSystem.csproj\" /><ProjectReference Include=\"UGUI.csproj\" /><Reference Include=\"nunit.framework\"><HintPath>$NUNIT</HintPath></Reference>" "SKYWARD_WEBXR" SkywardRuins.Editor
echo generated-editor
