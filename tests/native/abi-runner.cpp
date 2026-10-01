// Test-only DLL/shared-library consumer. Commands and responses are JSON lines.
#include <cstddef>
#include <cstdint>
#include <iostream>
#include <string>
#include <vector>
#ifdef _WIN32
#include <windows.h>
#else
#include <dlfcn.h>
#endif
int main(int argc,char**argv){
    if(argc!=2)return 2;
#ifdef _WIN32
    int n=MultiByteToWideChar(CP_UTF8,0,argv[1],-1,nullptr,0);std::vector<wchar_t> path(n);MultiByteToWideChar(CP_UTF8,0,argv[1],-1,path.data(),n);
    auto module=LoadLibraryExW(path.data(),nullptr,LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR|LOAD_LIBRARY_SEARCH_DEFAULT_DIRS);
    auto resolve=[&](const char*name){return reinterpret_cast<void*>(GetProcAddress(module,name));};
#else
    auto module=dlopen(argv[1],RTLD_NOW|RTLD_LOCAL);auto resolve=[&](const char*name){return dlsym(module,name);};
#endif
    if(!module){std::cerr<<"Could not load Puck library\n";return 3;}
    auto version=reinterpret_cast<uint32_t(*)()>(resolve("puck_abi_version"));
    auto create=reinterpret_cast<uint32_t(*)(const uint8_t*,size_t)>(resolve("puck_create"));
    auto command=reinterpret_cast<uint32_t(*)(uint32_t,const uint8_t*,size_t)>(resolve("puck_command"));
    auto destroy=reinterpret_cast<uint32_t(*)(uint32_t)>(resolve("puck_destroy"));
    auto length=reinterpret_cast<size_t(*)(uint32_t)>(resolve("puck_response_len"));
    auto copy=reinterpret_cast<size_t(*)(uint32_t,uint8_t*,size_t)>(resolve("puck_response_copy"));
    if(!version||!create||!command||!destroy||!length||!copy||version()!=1)return 4;
    uint32_t handle=0;std::string line;
    while(std::getline(std::cin,line)){
        auto split=line.find(' ');auto op=line.substr(0,split);auto data=split==std::string::npos?std::string():line.substr(split+1);
        if(op=="CREATE"){if(handle)destroy(handle);handle=create(reinterpret_cast<const uint8_t*>(data.data()),data.size());}
        else if(op=="CALL"){command(handle,reinterpret_cast<const uint8_t*>(data.data()),data.size());}
        else if(op=="DESTROY"){if(handle)destroy(handle);handle=0;std::cout<<"{\"ok\":true,\"value\":null}\n";continue;}
        else return 5;
        auto len=length(handle);std::vector<uint8_t> out(len);if(len==0||copy(handle,out.data(),len)!=len)return 6;
        std::cout.write(reinterpret_cast<const char*>(out.data()),len);std::cout<<'\n';
    }
    if(handle)destroy(handle);return 0;
}
