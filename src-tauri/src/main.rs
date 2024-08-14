#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use std::{fs, path::Path};
use tokio::process::Command;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

#[derive(Debug, Serialize, Deserialize)]
struct FavoriteFolder {
    name: String,
    path: String,
}

// Command to save favorites
#[tauri::command]
async fn save_favorites(favorites: Vec<FavoriteFolder>) -> Result<(), String> {
    let serialized = serde_json::to_string(&favorites).map_err(|e| e.to_string())?;
    fs::write("favorites.json", serialized).map_err(|e| e.to_string())?;
    Ok(())
}

// Command to load favorites
#[tauri::command]
async fn load_favorites() -> Result<Vec<FavoriteFolder>, String> {
    if let Ok(contents) = fs::read_to_string("favorites.json") {
        let favorites: Vec<FavoriteFolder> = serde_json::from_str(&contents).map_err(|e| e.to_string())?;
        Ok(favorites)
    } else {
        Ok(Vec::new())
    }
}

#[derive(Serialize)]
struct FileNode {
    name: String,
    path: String,
    is_directory: bool,
    children: Option<Vec<FileNode>>,
}

#[tauri::command]
async fn open_file(file_path: String) -> Result<bool, String> {
    if !Path::new(&file_path).exists() {
        return Err(format!("File not found: {}", file_path));
    }

    let result = if cfg!(target_os = "windows") {
        Command::new("explorer")
            .arg(&file_path)
            .spawn()
    } else if cfg!(target_os = "macos") {
        Command::new("open")
            .arg(&file_path)
            .spawn()
    } else if cfg!(target_os = "linux") {
        Command::new("xdg-open")
            .arg(&file_path)
            .spawn()
    } else {
        return Err("Unsupported operating system".to_string());
    };

    match result {
        Ok(_) => Ok(true),
        Err(e) => {
            println!("Failed to open file: {}", e);
            Err(e.to_string())
        },
    }
}

#[tauri::command]
async fn read_directory_async(folder_path: String) -> Result<Vec<FileNode>, String> {
    let mut structure = Vec::new();
    let entries = fs::read_dir(&folder_path).map_err(|e| e.to_string())?;
    
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
        
        let node = FileNode {
            name: entry.file_name().to_string_lossy().to_string(),
            path: path.to_string_lossy().to_string(),
            is_directory: metadata.is_dir(),
            children: if metadata.is_dir() { Some(Vec::new()) } else { None },
        };
        structure.push(node);
    }
    
    Ok(structure)
}

#[tauri::command]
async fn open_folder(folder_path: String) -> Result<bool, String> {
    if !Path::new(&folder_path).exists() {
        return Err(format!("Folder not found: {}", folder_path));
    }

    let result = Command::new("explorer")
        .arg(folder_path)
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(result.wait_with_output().await.is_ok())
}

#[tauri::command]
async fn browse_folder() -> Result<Option<String>, String> {
    let dialog = tauri::api::dialog::blocking::FileDialogBuilder::new()
        .pick_folder();

    Ok(dialog.map(|p| p.to_string_lossy().to_string()))
}

#[derive(Serialize)]
struct SearchResult {
    name: String,
    path: String,
    is_directory: bool,
}

#[tauri::command]
async fn search_directory(folder_path: String, search_term: String) -> Result<Vec<SearchResult>, String> {
    let mut results = Vec::new();
    let mut queue = VecDeque::new();
    queue.push_back(folder_path);

    while let Some(current_folder) = queue.pop_front() {
        let entries = fs::read_dir(&current_folder).map_err(|e| e.to_string())?;

        for entry in entries {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;

            let name = entry.file_name().to_string_lossy().to_lowercase();
            if name.contains(&search_term.to_lowercase()) {
                results.push(SearchResult {
                    name: entry.file_name().to_string_lossy().to_string(),
                    path: path.to_string_lossy().to_string(),
                    is_directory: metadata.is_dir(),
                });
            }

            if metadata.is_dir() {
                queue.push_back(path.to_string_lossy().to_string());
            }
        }
    }

    Ok(results)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            read_directory_async,
            open_folder,
            browse_folder,
            open_file,
            save_favorites,
            load_favorites,
            search_directory,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
