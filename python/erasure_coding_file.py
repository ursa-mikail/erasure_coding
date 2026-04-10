import random
import os
import json
from typing import List, Tuple, Dict
import hashlib

class SimpleErasureCode:
    def __init__(self, k: int, m: int):
        self.k = k  # data fragments
        self.m = m  # parity fragments
    
    def encode(self, data: bytes) -> Tuple[List[bytes], Dict]:
        """Encode data with metadata"""
        original_length = len(data)
        
        # Calculate chunk size
        chunk_size = (original_length + self.k - 1) // self.k
        
        # Split data into k chunks with padding
        chunks = []
        padded_data = data + b'\x00' * (chunk_size * self.k - original_length)
        
        for i in range(self.k):
            start = i * chunk_size
            end = (i + 1) * chunk_size
            chunk = padded_data[start:end]
            chunks.append(chunk)
        
        # Create parity chunks using XOR
        parity_chunks = []
        for i in range(self.m):
            parity = bytearray(chunk_size)
            for j in range(self.k):
                chunk_data = chunks[j]
                for idx in range(chunk_size):
                    parity[idx] ^= chunk_data[idx]
            parity_chunks.append(bytes(parity))
        
        # Create metadata
        metadata = {
            'original_length': original_length,
            'chunk_size': chunk_size,
            'k': self.k,
            'm': self.m,
            'num_fragments': self.k + self.m,
            'data_hash': hashlib.sha256(data).hexdigest()
        }
        
        return chunks + parity_chunks, metadata
    
    def decode(self, fragments: List[bytes], fragment_indices: List[int], metadata: Dict) -> bytes:
        """Reconstruct data from available fragments using metadata"""
        k = metadata['k']
        m = metadata['m']
        chunk_size = metadata['chunk_size']
        original_length = metadata['original_length']
        
        if len(fragments) < k:
            raise ValueError(f"Need at least {k} fragments, got {len(fragments)}")
        
        # Build a dict of available fragments
        fragment_dict = {}
        for i, idx in enumerate(fragment_indices):
            fragment_dict[idx] = fragments[i]
        
        # Separate data and parity fragments
        data_indices = [idx for idx in fragment_indices if idx < k]
        parity_indices = [idx for idx in fragment_indices if idx >= k]
        
        # Initialize reconstruction - we need all k data chunks
        reconstructed_chunks = [None] * k
        
        # Fill in available data chunks
        for idx in data_indices:
            reconstructed_chunks[idx] = fragment_dict[idx]
        
        # Find missing data chunks
        missing_data_indices = [i for i in range(k) if reconstructed_chunks[i] is None]
        
        if len(missing_data_indices) == 0:
            # All data chunks available - simple case
            pass
        elif len(missing_data_indices) == 1 and len(parity_indices) > 0:
            # One missing chunk, we can reconstruct with XOR parity
            missing_idx = missing_data_indices[0]
            parity_idx = parity_indices[0]  # Use first available parity
            
            # XOR: missing = parity XOR (all other data chunks)
            result = bytearray(chunk_size)
            # Start with parity
            for idx in range(chunk_size):
                result[idx] = fragment_dict[parity_idx][idx]
            
            # XOR all available data chunks
            for idx in data_indices:
                for byte_idx in range(chunk_size):
                    result[byte_idx] ^= fragment_dict[idx][byte_idx]
            
            reconstructed_chunks[missing_idx] = bytes(result)
        elif len(missing_data_indices) > 1:
            raise ValueError(f"Cannot reconstruct {len(missing_data_indices)} missing data chunks with simple XOR parity")
        else:
            raise ValueError("Missing data chunk but no parity available")
        
        # Join all reconstructed chunks
        reconstructed = b''.join(reconstructed_chunks)
        
        # Return only the original data length
        return reconstructed[:original_length]

def read_file_and_split(filename: str, num_parts: int) -> Tuple[bytes, List[bytes]]:
    """Read a file and split it into N parts"""
    try:
        with open(filename, 'rb') as file:
            original_data = file.read()
        
        file_size = len(original_data)
        print(f"✓ File '{filename}' read successfully")
        print(f"  File size: {file_size} bytes")
        
        # Calculate part size
        part_size = (file_size + num_parts - 1) // num_parts
        
        # Split into parts
        parts = []
        for i in range(num_parts):
            start = i * part_size
            end = min((i + 1) * part_size, file_size)
            part = original_data[start:end]
            parts.append(part)
        
        print(f"  Split into {num_parts} parts")
        print(f"  Part size (target): {part_size} bytes")
        
        return original_data, parts
        
    except Exception as e:
        print(f"✗ Error reading file: {e}")
        return b'', []

def calculate_hash(data: bytes) -> str:
    """Calculate SHA256 hash of data"""
    return hashlib.sha256(data).hexdigest()

def file_based_erasure_coding(filename: str, num_parts: int, k: int, m: int):
    """Perform erasure coding on file parts with JSON metadata"""
    print(f"\n{'='*60}")
    print(f"FILE-BASED ERASURE CODING WITH METADATA")
    print(f"{'='*60}")
    print(f"File: {filename}")
    print(f"Splitting into: {num_parts} parts")
    print(f"Erasure coding: k={k}, m={m}")
    
    # Calculate original file hash
    with open(filename, 'rb') as f:
        original_data = f.read()
    original_hash = calculate_hash(original_data)
    print(f"Original file SHA256: {original_hash}")
    print(f"Original file size: {len(original_data)} bytes")
    
    # Step 1: Read and split the file
    _, file_parts = read_file_and_split(filename, num_parts)
    
    if not file_parts:
        return
    
    # Step 2: Process each file part with erasure coding
    all_fragments = []
    all_metadata = []
    
    for part_idx, part_data in enumerate(file_parts):
        print(f"\n--- Encoding Part {part_idx + 1}/{num_parts} ---")
        print(f"  Part size: {len(part_data)} bytes")
        
        ec = SimpleErasureCode(k=k, m=m)
        fragments, metadata = ec.encode(part_data)
        
        print(f"  Created {len(fragments)} fragments ({k} data + {m} parity)")
        print(f"  Each fragment size: {metadata['chunk_size']} bytes")
        print(f"  Metadata: original_length={metadata['original_length']}, chunk_size={metadata['chunk_size']}")
        
        all_fragments.append(fragments)
        all_metadata.append(metadata)
    
    # Save metadata to JSON
    metadata_file = {
        'original_filename': os.path.basename(filename),
        'original_size': len(original_data),
        'original_hash': original_hash,
        'num_parts': num_parts,
        'k': k,
        'm': m,
        'parts': all_metadata
    }
    
    with open('reconstruction_metadata.json', 'w') as f:
        json.dump(metadata_file, f, indent=2)
    print(f"\n✓ Metadata saved to reconstruction_metadata.json")
    
    # Step 3: Simulate fragment storage and loss
    print(f"\n{'='*60}")
    print("SIMULATING FRAGMENT LOSS AND RECONSTRUCTION")
    print(f"{'='*60}")
    
    reconstructed_parts = []
    
    for part_idx, (fragments, metadata) in enumerate(zip(all_fragments, all_metadata)):
        print(f"\n--- Reconstructing Part {part_idx + 1}/{num_parts} ---")
        
        # Simulate random fragment selection (as if some were lost)
        # Strategy: Ensure we can reconstruct with simple XOR (need k-1 data + 1 parity, or all k data)
        all_indices = list(range(len(fragments)))
        random.shuffle(all_indices)
        
        # Select k fragments, ensuring we have at least k-1 data fragments
        # This allows reconstruction with our simple XOR parity
        selected_indices = []
        data_count = 0
        parity_count = 0
        
        for idx in all_indices:
            if len(selected_indices) >= k:
                break
            if idx < k:  # Data fragment
                selected_indices.append(idx)
                data_count += 1
            elif data_count >= k - 1:  # Can add parity if we have enough data
                selected_indices.append(idx)
                parity_count += 1
        
        # If we don't have enough, add more data fragments
        if len(selected_indices) < k:
            for idx in range(k):
                if idx not in selected_indices:
                    selected_indices.append(idx)
                if len(selected_indices) >= k:
                    break
        
        selected_indices = sorted(selected_indices)
        selected_fragments = [fragments[i] for i in selected_indices]
        
        data_selected = [i for i in selected_indices if i < k]
        parity_selected = [i for i in selected_indices if i >= k]
        
        print(f"  Available fragments: {selected_indices} (out of {list(range(k+m))})")
        print(f"    - Data fragments: {data_selected}")
        print(f"    - Parity fragments: {parity_selected}")
        
        # Determine what was "lost"
        lost_indices = sorted(set(range(k+m)) - set(selected_indices))
        if lost_indices:
            print(f"  Lost fragments: {lost_indices}")
        
        # Reconstruct using metadata
        ec = SimpleErasureCode(k=k, m=m)
        try:
            reconstructed_data = ec.decode(selected_fragments, selected_indices, metadata)
            
            print(f"  Reconstructed part size: {len(reconstructed_data)} bytes")
            print(f"  Expected part size: {metadata['original_length']} bytes")
            
            # Verify this part
            expected_data = file_parts[part_idx]
            reconstructed_hash = calculate_hash(reconstructed_data)
            expected_hash = metadata['data_hash']
            
            if reconstructed_hash == expected_hash:
                print(f"  ✓ SUCCESS: Part hash matches! ({reconstructed_hash[:16]}...)")
            else:
                print(f"  ✗ FAILED: Hash mismatch!")
                print(f"    Expected: {expected_hash[:16]}...")
                print(f"    Got:      {reconstructed_hash[:16]}...")
            
            reconstructed_parts.append(reconstructed_data)
            
        except Exception as e:
            print(f"  ✗ ERROR during reconstruction: {e}")
            return
    
    # Step 4: Save and verify reconstructed file
    output_filename = "reconstructed_file.bin"
    final_reconstructed = b''.join(reconstructed_parts)
    
    with open(output_filename, 'wb') as f:
        f.write(final_reconstructed)
    
    reconstructed_hash = calculate_hash(final_reconstructed)
    
    print(f"\n{'='*60}")
    print("FINAL VERIFICATION")
    print(f"{'='*60}")
    
    print(f"Original file size: {len(original_data)} bytes")
    print(f"Reconstructed file size: {len(final_reconstructed)} bytes")
    print(f"Original file hash: {original_hash}")
    print(f"Reconstructed file hash: {reconstructed_hash}")
    
    if original_hash == reconstructed_hash:
        print("\n🎉 SUCCESS: Complete file reconstructed perfectly!")
        print("✅ HASHES MATCH!")
        print(f"✅ Output saved to: {output_filename}")
    else:
        print("\n❌ FAILED: File reconstruction failed!")
        print(f"   Length match: {len(original_data) == len(final_reconstructed)}")
        
        # Find first difference
        for i in range(min(len(original_data), len(final_reconstructed))):
            if original_data[i] != final_reconstructed[i]:
                print(f"   First difference at byte {i}")
                break

def create_test_file():
    """Create a simple test file for verification"""
    test_data = b"Hello, this is a test file for erasure coding! " * 100
    with open("test_file.bin", "wb") as f:
        f.write(test_data)
    return "test_file.bin"

if __name__ == "__main__":
    # Use a test file first to verify the algorithm works
    test_filename = create_test_file()
    print("Testing with a simple file first...")
    
    file_based_erasure_coding(
        filename=test_filename,
        num_parts=2,
        k=4,
        m=2
    )
    
    # Then try with the PDF
    print("\n\n" + "="*60)
    print("NOW TESTING WITH PDF FILE")
    print("="*60)
    pdf_filename = "/content/sample_data/brief_2025-09-22_1010hr.pdf"
    if os.path.exists(pdf_filename):
        file_based_erasure_coding(
            filename=pdf_filename,
            num_parts=3,
            k=4,
            m=2
        )
    else:
        print(f"PDF file not found: {pdf_filename}")

"""
Testing with a simple file first...

============================================================
FILE-BASED ERASURE CODING WITH METADATA
============================================================
File: test_file.bin
Splitting into: 2 parts
Erasure coding: k=4, m=2
Original file SHA256: cba05664411b3d8c4a7f96c1cfbb31499baebcac0bcc833793006c9e6841c791
Original file size: 4700 bytes
✓ File 'test_file.bin' read successfully
  File size: 4700 bytes
  Split into 2 parts
  Part size (target): 2350 bytes

--- Encoding Part 1/2 ---
  Part size: 2350 bytes
  Created 6 fragments (4 data + 2 parity)
  Each fragment size: 588 bytes
  Metadata: original_length=2350, chunk_size=588

--- Encoding Part 2/2 ---
  Part size: 2350 bytes
  Created 6 fragments (4 data + 2 parity)
  Each fragment size: 588 bytes
  Metadata: original_length=2350, chunk_size=588

✓ Metadata saved to reconstruction_metadata.json

============================================================
SIMULATING FRAGMENT LOSS AND RECONSTRUCTION
============================================================

--- Reconstructing Part 1/2 ---
  Available fragments: [0, 1, 2, 3] (out of [0, 1, 2, 3, 4, 5])
    - Data fragments: [0, 1, 2, 3]
    - Parity fragments: []
  Lost fragments: [4, 5]
  Reconstructed part size: 2350 bytes
  Expected part size: 2350 bytes
  ✓ SUCCESS: Part hash matches! (dd92c9d0d7c0fd30...)

--- Reconstructing Part 2/2 ---
  Available fragments: [0, 1, 2, 3] (out of [0, 1, 2, 3, 4, 5])
    - Data fragments: [0, 1, 2, 3]
    - Parity fragments: []
  Lost fragments: [4, 5]
  Reconstructed part size: 2350 bytes
  Expected part size: 2350 bytes
  ✓ SUCCESS: Part hash matches! (dd92c9d0d7c0fd30...)

============================================================
FINAL VERIFICATION
============================================================
Original file size: 4700 bytes
Reconstructed file size: 4700 bytes
Original file hash: cba05664411b3d8c4a7f96c1cfbb31499baebcac0bcc833793006c9e6841c791
Reconstructed file hash: cba05664411b3d8c4a7f96c1cfbb31499baebcac0bcc833793006c9e6841c791

🎉 SUCCESS: Complete file reconstructed perfectly!
✅ HASHES MATCH!
✅ Output saved to: reconstructed_file.bin


============================================================
NOW TESTING WITH PDF FILE
============================================================

============================================================
FILE-BASED ERASURE CODING WITH METADATA
============================================================
File: /content/sample_data/Michael's CV_brief_2025-09-22_1010hr.pdf
Splitting into: 3 parts
Erasure coding: k=4, m=2
Original file SHA256: 60368f509d1d76300a5c5ed1ac1baa7822768c44708d00ac4b41bf13019d0d61
Original file size: 273105 bytes
✓ File '/content/sample_data/CV_brief_2025-09-22_1010hr.pdf' read successfully
  File size: 273105 bytes
  Split into 3 parts
  Part size (target): 91035 bytes

--- Encoding Part 1/3 ---
  Part size: 91035 bytes
  Created 6 fragments (4 data + 2 parity)
  Each fragment size: 22759 bytes
  Metadata: original_length=91035, chunk_size=22759

--- Encoding Part 2/3 ---
  Part size: 91035 bytes
  Created 6 fragments (4 data + 2 parity)
  Each fragment size: 22759 bytes
  Metadata: original_length=91035, chunk_size=22759

--- Encoding Part 3/3 ---
  Part size: 91035 bytes
  Created 6 fragments (4 data + 2 parity)
  Each fragment size: 22759 bytes
  Metadata: original_length=91035, chunk_size=22759

✓ Metadata saved to reconstruction_metadata.json

============================================================
SIMULATING FRAGMENT LOSS AND RECONSTRUCTION
============================================================

--- Reconstructing Part 1/3 ---
  Available fragments: [0, 1, 2, 3] (out of [0, 1, 2, 3, 4, 5])
    - Data fragments: [0, 1, 2, 3]
    - Parity fragments: []
  Lost fragments: [4, 5]
  Reconstructed part size: 91035 bytes
  Expected part size: 91035 bytes
  ✓ SUCCESS: Part hash matches! (5d84c6bac7577f0b...)

--- Reconstructing Part 2/3 ---
  Available fragments: [0, 1, 2, 3] (out of [0, 1, 2, 3, 4, 5])
    - Data fragments: [0, 1, 2, 3]
    - Parity fragments: []
  Lost fragments: [4, 5]
  Reconstructed part size: 91035 bytes
  Expected part size: 91035 bytes
  ✓ SUCCESS: Part hash matches! (5b10d51fbae8df9b...)

--- Reconstructing Part 3/3 ---
  Available fragments: [0, 1, 2, 3] (out of [0, 1, 2, 3, 4, 5])
    - Data fragments: [0, 1, 2, 3]
    - Parity fragments: []
  Lost fragments: [4, 5]
  Reconstructed part size: 91035 bytes
  Expected part size: 91035 bytes
  ✓ SUCCESS: Part hash matches! (dbe3ec77df7dee25...)

============================================================
FINAL VERIFICATION
============================================================
Original file size: 273105 bytes
Reconstructed file size: 273105 bytes
Original file hash: 60368f509d1d76300a5c5ed1ac1baa7822768c44708d00ac4b41bf13019d0d61
Reconstructed file hash: 60368f509d1d76300a5c5ed1ac1baa7822768c44708d00ac4b41bf13019d0d61

🎉 SUCCESS: Complete file reconstructed perfectly!
✅ HASHES MATCH!
✅ Output saved to: reconstructed_file.bin
"""